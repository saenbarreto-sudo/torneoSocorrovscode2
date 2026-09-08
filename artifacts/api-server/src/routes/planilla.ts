import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  planillaTable,
  partidosTable,
  jugadoresTable,
  golesTable,
  tarjetasTable,
  ajustesTable,
} from "@workspace/db";
import { requireAuth, writeAccess } from "../lib/permissions";
import { GetPlanillaResponse, SavePlanillaBody, GetPlanillaParams } from "@workspace/api-zod";

const router: IRouter = Router();

/**
 * Devuelve la nómina completa de los dos equipos del partido — igual que la
 * planilla física — con lo ya registrado para cada jugador: si estuvo, su
 * dorsal, si fue titular, cuántos goles hizo y qué tarjetas recibió.
 *
 * Se listan TODOS los jugadores de ambos equipos (no solo los que jugaron),
 * porque la mesa marca sobre la nómina completa.
 */
router.get("/partidos/:id/planilla", async (req, res): Promise<void> => {
  const params = GetPlanillaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const partidoId = params.data.id;

  const [partido] = await db.select().from(partidosTable).where(eq(partidosTable.id, partidoId));
  if (!partido) {
    res.status(404).json({ error: "Partido not found" });
    return;
  }

  const rows = await db.execute(sql`
    SELECT
      j.id                        as jugador_id,
      j.nombre                    as jugador_nombre,
      j.equipo_id                 as equipo_id,
      j.n_carnet                  as n_carnet,
      pl.id IS NOT NULL           as jugo,
      pl.dorsal                   as dorsal,
      COALESCE(pl.titular, true)  as titular,
      COALESCE(g.total, 0)::int   as goles,
      COALESCE(t.amarillas, 0)::int as amarillas,
      COALESCE(t.rojas, 0)::int   as rojas,
      COALESCE(t.fechas_sancion, 0)::int as fechas_sancion
    FROM jugadores j
    LEFT JOIN planilla pl
      ON pl.jugador_id = j.id AND pl.partido_id = ${partidoId}
    LEFT JOIN (
      SELECT jugador_id, SUM(cantidad) as total
      FROM goles WHERE partido_id = ${partidoId} GROUP BY jugador_id
    ) g ON g.jugador_id = j.id
    LEFT JOIN (
      SELECT jugador_id,
             COUNT(*) FILTER (WHERE tipo = 'amarilla') as amarillas,
             COUNT(*) FILTER (WHERE tipo = 'roja')     as rojas,
             MAX(fechas_sancion) FILTER (WHERE tipo = 'roja') as fechas_sancion
      FROM tarjetas WHERE partido_id = ${partidoId} GROUP BY jugador_id
    ) t ON t.jugador_id = j.id
    WHERE j.equipo_id IN (${partido.localId}, ${partido.visitanteId})
      AND j.activo = true
    ORDER BY j.equipo_id, j.nombre
  `);

  const jugadores = (rows.rows ?? rows).map((r: Record<string, unknown>) => ({
    jugadorId: Number(r.jugador_id),
    jugadorNombre: String(r.jugador_nombre),
    equipoId: Number(r.equipo_id),
    nCarnet: r.n_carnet == null ? null : Number(r.n_carnet),
    jugo: Boolean(r.jugo),
    dorsal: r.dorsal == null ? null : Number(r.dorsal),
    titular: Boolean(r.titular),
    goles: Number(r.goles),
    amarillas: Number(r.amarillas),
    rojas: Number(r.rojas),
    fechasSancion: Number(r.fechas_sancion ?? 0),
  }));

  res.json(
    GetPlanillaResponse.parse({
      partidoId,
      localId: partido.localId,
      visitanteId: partido.visitanteId,
      arbitro: partido.arbitro,
      mesa: partido.mesa,
      jugadores,
    }),
  );
});

/**
 * Guarda la planilla completa del partido y recalcula el marcador a partir
 * de los goles individuales (no se ingresa a mano). Reemplaza por completo
 * los goles, tarjetas y participaciones de ESTE partido, para que lo que
 * quede guardado sea exactamente lo que muestra la planilla.
 */
router.put("/partidos/:id/planilla", requireAuth, writeAccess.partidos, async (req, res): Promise<void> => {
  const params = GetPlanillaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SavePlanillaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const partidoId = params.data.id;

  const [partido] = await db.select().from(partidosTable).where(eq(partidosTable.id, partidoId));
  if (!partido) {
    res.status(404).json({ error: "Partido not found" });
    return;
  }
  if (partido.walkover) {
    res.status(409).json({
      error: "Este partido está marcado como W.O.: su marcador es 6-0 y no lleva planilla de goleadores.",
    });
    return;
  }

  // Solo se aceptan jugadores que realmente pertenecen a alguno de los dos equipos.
  const idsValidos = new Set(
    (
      await db
        .select({ id: jugadoresTable.id, equipoId: jugadoresTable.equipoId })
        .from(jugadoresTable)
        .where(sql`equipo_id IN (${partido.localId}, ${partido.visitanteId})`)
    ).map((j) => j.id),
  );

  // El valor de cada tarjeta nueva sale de /ajustes, no de lo que mande el
  // cliente: así, si un jugador recibe una amarilla en el partido, queda
  // con el valor correcto de inmediato, sin que nadie tenga que escribirlo
  // a mano. Si todavía no existe la fila de ajustes (torneo recién
  // instalado), el valor por defecto es 0 — se corrige apenas se configure
  // en la pestaña Ajustes.
  const [ajustes] = await db.select().from(ajustesTable).where(eq(ajustesTable.id, 1));
  const valorAmarilla = ajustes?.valorAmarilla ?? 0;
  const valorRoja = ajustes?.valorRoja ?? 0;

  const filas = parsed.data.jugadores.filter((j) => idsValidos.has(j.jugadorId));
  const equipoDeJugador = new Map(
    (
      await db
        .select({ id: jugadoresTable.id, equipoId: jugadoresTable.equipoId })
        .from(jugadoresTable)
        .where(sql`equipo_id IN (${partido.localId}, ${partido.visitanteId})`)
    ).map((j) => [j.id, j.equipoId]),
  );

  await db.transaction(async (tx) => {
    // Se borra lo anterior de este partido y se reescribe con lo enviado.
    await tx.delete(planillaTable).where(eq(planillaTable.partidoId, partidoId));
    await tx.delete(golesTable).where(eq(golesTable.partidoId, partidoId));
    await tx
      .delete(tarjetasTable)
      .where(and(eq(tarjetasTable.partidoId, partidoId), eq(tarjetasTable.pagada, false)));

    const participantes = filas.filter((j) => j.jugo);

    if (participantes.length > 0) {
      await tx.insert(planillaTable).values(
        participantes.map((j) => ({
          partidoId,
          jugadorId: j.jugadorId,
          dorsal: j.dorsal ?? null,
          titular: j.titular ?? true,
        })),
      );
    }

    const conGoles = participantes.filter((j) => (j.goles ?? 0) > 0);
    if (conGoles.length > 0) {
      await tx.insert(golesTable).values(
        conGoles.map((j) => ({
          jugadorId: j.jugadorId,
          partidoId,
          semana: partido.semana,
          fecha: partido.fecha ?? null,
          cantidad: j.goles ?? 0,
          propio: false,
        })),
      );
    }

    const tarjetasNuevas: (typeof tarjetasTable.$inferInsert)[] = [];
    for (const j of participantes) {
      for (let i = 0; i < (j.amarillas ?? 0); i++) {
        tarjetasNuevas.push({
          jugadorId: j.jugadorId,
          partidoId,
          tipo: "amarilla",
          semana: partido.semana,
          fecha: partido.fecha ?? null,
          valor: valorAmarilla,
          pagada: false,
        });
      }
      if ((j.rojas ?? 0) > 0) {
        tarjetasNuevas.push({
          jugadorId: j.jugadorId,
          partidoId,
          tipo: "roja",
          semana: partido.semana,
          fecha: partido.fecha ?? null,
          valor: valorRoja,
          fechasSancion: j.fechasSancion ?? 0,
          pagada: false,
        });
      }
    }
    if (tarjetasNuevas.length > 0) {
      await tx.insert(tarjetasTable).values(tarjetasNuevas);
    }

    // El marcador se deduce de los goles individuales.
    let golesLocal = 0;
    let golesVisitante = 0;
    for (const j of conGoles) {
      const equipoId = equipoDeJugador.get(j.jugadorId);
      if (equipoId === partido.localId) golesLocal += j.goles ?? 0;
      else if (equipoId === partido.visitanteId) golesVisitante += j.goles ?? 0;
    }

    await tx
      .update(partidosTable)
      .set({
        golesLocal,
        golesVisitante,
        jugado: true,
        // Solo se sobreescriben si vienen en la petición, para no borrar
        // el árbitro asignado al programar el partido.
        ...(parsed.data.arbitro !== undefined ? { arbitro: parsed.data.arbitro || null } : {}),
        ...(parsed.data.mesa !== undefined ? { mesa: parsed.data.mesa || null } : {}),
      })
      .where(eq(partidosTable.id, partidoId));
  });

  res.sendStatus(204);
});

export default router;
