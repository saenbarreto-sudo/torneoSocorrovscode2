import { Router, type IRouter } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  planillaTable,
  partidosTable,
  jugadoresTable,
  golesTable,
  tarjetasTable,
  ajustesTable,
  arbitrosTable,
} from "@workspace/db";
import { requireAuth, writeAccess } from "../lib/permissions";
import { GetPlanillaResponse, SavePlanillaBody, GetPlanillaParams } from "@workspace/api-zod";

const router: IRouter = Router();

/**
 * Cuántas fechas de sanción le faltaban a cada jugador de estos dos equipos
 * AL MOMENTO de este partido.
 *
 * Se mide contra el partido y no contra "hoy" a propósito: una planilla se
 * puede llenar días después, y lo que importa es cuántas fechas había
 * cumplido el jugador cuando se jugó, no cuántas lleva ahora.
 *
 * Una fecha se cumple igual que en GET /sanciones: el equipo disputó un
 * partido posterior a la tarjeta (y anterior a este) sin que el jugador
 * apareciera en la planilla.
 *
 * La tarjeta mostrada en ESTE partido no cuenta, porque el jugador sí jugó
 * el partido en el que lo expulsaron — la sanción empieza a correr después.
 */
async function fechasPendientesPorJugador(
  partido: typeof partidosTable.$inferSelect,
): Promise<Map<number, number>> {
  const rows = await db.execute(sql`
    SELECT
      t.jugador_id,
      MAX(GREATEST(t.fechas_sancion - (
        SELECT COUNT(*)::int
        FROM partidos pp
        WHERE pp.jugado = true
          AND pp.temporada IS NULL
          AND (pp.local_id = j.equipo_id OR pp.visitante_id = j.equipo_id)
          AND (
            pp.semana > t.semana
            OR (pp.semana = t.semana AND t.partido_id IS NOT NULL AND pp.id > t.partido_id)
          )
          AND (
            pp.semana < ${partido.semana}
            OR (pp.semana = ${partido.semana} AND pp.id < ${partido.id})
          )
          AND NOT EXISTS (
            SELECT 1 FROM planilla pl
            WHERE pl.partido_id = pp.id AND pl.jugador_id = t.jugador_id
          )
      ), 0))::int as pendientes
    FROM tarjetas t
    JOIN jugadores j ON j.id = t.jugador_id
    WHERE t.fechas_sancion > 0
      AND t.temporada IS NULL
      AND j.equipo_id IN (${partido.localId}, ${partido.visitanteId})
      AND (t.partido_id IS NULL OR t.partido_id <> ${partido.id})
    GROUP BY t.jugador_id
  `);

  const pendientes = new Map<number, number>();
  for (const r of (rows.rows ?? rows) as Record<string, unknown>[]) {
    const valor = Number(r.pendientes ?? 0);
    if (valor > 0) pendientes.set(Number(r.jugador_id), valor);
  }
  return pendientes;
}

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
  const arbitroNombre = partido.arbitroId
    ? (await db.select({ nombre: arbitrosTable.nombre }).from(arbitrosTable).where(eq(arbitrosTable.id, partido.arbitroId)))[0]?.nombre ?? null
    : null;

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

  const pendientes = await fechasPendientesPorJugador(partido);

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
    fechasPendientes: pendientes.get(Number(r.jugador_id)) ?? 0,
  }));

  res.json(
    GetPlanillaResponse.parse({
      partidoId,
      localId: partido.localId,
      visitanteId: partido.visitanteId,
      arbitroId: partido.arbitroId,
      arbitroNombre,
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

  // Un partido no es válido con menos de 6 jugadores alineados por equipo.
  // Se valida acá (no solo en el formulario) porque esta es la ruta que de
  // verdad protege los datos — cualquiera que le pegue directo a la API se
  // salta la validación del frontend.
  const MINIMO_JUGADORES = 6;
  const jugoLocal = filas.filter((j) => j.jugo && equipoDeJugador.get(j.jugadorId) === partido.localId).length;
  const jugoVisitante = filas.filter((j) => j.jugo && equipoDeJugador.get(j.jugadorId) === partido.visitanteId).length;
  if (jugoLocal < MINIMO_JUGADORES || jugoVisitante < MINIMO_JUGADORES) {
    const faltantes: string[] = [];
    if (jugoLocal < MINIMO_JUGADORES) faltantes.push(`al local le faltan ${MINIMO_JUGADORES - jugoLocal}`);
    if (jugoVisitante < MINIMO_JUGADORES) faltantes.push(`al visitante le faltan ${MINIMO_JUGADORES - jugoVisitante}`);
    res.status(400).json({
      error: `Cada equipo necesita al menos ${MINIMO_JUGADORES} jugadores alineados para guardar el partido (${faltantes.join(", ")}).`,
    });
    return;
  }

  // Un jugador con fechas de sanción pendientes no puede alinearse. Igual
  // que el mínimo de jugadores, se valida acá y no solo en el formulario:
  // esta es la ruta que de verdad protege los datos.
  const pendientesPorJugador = await fechasPendientesPorJugador(partido);
  const sancionadosAlineados = filas
    .filter((j) => j.jugo && (pendientesPorJugador.get(j.jugadorId) ?? 0) > 0)
    .map((j) => ({ jugadorId: j.jugadorId, fechas: pendientesPorJugador.get(j.jugadorId)! }));

  if (sancionadosAlineados.length > 0) {
    const nombres = new Map(
      (
        await db
          .select({ id: jugadoresTable.id, nombre: jugadoresTable.nombre })
          .from(jugadoresTable)
          .where(inArray(jugadoresTable.id, sancionadosAlineados.map((s) => s.jugadorId)))
      ).map((j) => [j.id, j.nombre]),
    );
    const detalle = sancionadosAlineados
      .map((s) => `${nombres.get(s.jugadorId) ?? `Jugador ${s.jugadorId}`} (le ${s.fechas === 1 ? "falta 1 fecha" : `faltan ${s.fechas} fechas`})`)
      .join(", ");
    res.status(409).json({
      error:
        `No se puede alinear a un jugador que todavía no ha cumplido su sanción: ${detalle}. ` +
        "Si la sanción está mal registrada, corrige las fechas de la tarjeta roja en Amonestados.",
    });
    return;
  }

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
        ...(parsed.data.arbitroId !== undefined ? { arbitroId: parsed.data.arbitroId } : {}),
        ...(parsed.data.mesa !== undefined ? { mesa: parsed.data.mesa || null } : {}),
      })
      .where(eq(partidosTable.id, partidoId));
  });

  res.sendStatus(204);
});

export default router;
