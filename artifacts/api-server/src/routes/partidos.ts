import { Router, type IRouter } from "express";
import { eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, partidosTable, equiposTable } from "@workspace/db";
import { filtroTemporadaSql, temporadaPedida } from "../lib/temporada";
import { requireAuth, writeAccess } from "../lib/permissions";
import { respondIfDeleteBlocked } from "../lib/delete-errors";
import {
  CreatePartidoBody,
  CreatePartidoResponse,
  GetPartidoParams,
  GetPartidoResponse,
  GetPartidosResponse,
  GetPartidosQueryParams,
  UpdatePartidoBody,
  UpdatePartidoParams,
  UpdatePartidoResponse,
  DeletePartidoParams,
  CreatePartidosLoteBody,
  CreatePartidosLoteResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function fetchPartidoWithTeams(id: number) {
  const local = equiposTable;
  const visitante = db.$with("visitante").as(db.select().from(equiposTable));

  const result = await db.execute(sql`
    SELECT p.*, l.nombre as local_nombre, v.nombre as visitante_nombre
    FROM partidos p
    JOIN equipos l ON l.id = p.local_id
    JOIN equipos v ON v.id = p.visitante_id
    WHERE p.id = ${id}
  `);
  const row = result.rows[0];
  return row as Record<string, unknown> | undefined;
}

function mapPartido(row: Record<string, unknown>) {
  return {
    id: row.id,
    semana: row.semana,
    fecha: row.fecha ?? null,
    hora: row.hora ?? null,
    localId: row.local_id,
    localNombre: row.local_nombre,
    visitanteId: row.visitante_id,
    visitanteNombre: row.visitante_nombre,
    golesLocal: row.goles_local ?? null,
    golesVisitante: row.goles_visitante ?? null,
    penalesLocal: row.penales_local ?? null,
    penalesVisitante: row.penales_visitante ?? null,
    jugado: row.jugado,
    fase: row.fase ?? null,
    walkover: row.walkover ?? false,
    walkoverGanadorId: row.walkover_ganador_id ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

/**
 * Art. 23 del reglamento: el marcador oficial de un W.O. es 6-0 a favor
 * del equipo ganador. Esos goles cuentan para la tabla de posiciones,
 * pero no deben registrarse goleadores individuales (por eso no se toca
 * la tabla de goles aquí).
 */
function normalizarWalkover<T extends {
  walkover?: boolean;
  walkoverGanadorId?: number;
  localId?: number;
  visitanteId?: number;
  golesLocal?: number;
  golesVisitante?: number;
  jugado?: boolean;
}>(data: T, existente?: { localId: number; visitanteId: number }): T {
  if (!data.walkover) return data;

  const localId = data.localId ?? existente?.localId;
  const visitanteId = data.visitanteId ?? existente?.visitanteId;
  const ganadorId = data.walkoverGanadorId;

  if (ganadorId == null || (ganadorId !== localId && ganadorId !== visitanteId)) {
    throw new Error("Debes indicar cuál de los dos equipos ganó el W.O.");
  }

  return {
    ...data,
    golesLocal: ganadorId === localId ? 6 : 0,
    golesVisitante: ganadorId === visitanteId ? 6 : 0,
    jugado: true,
  };
}

router.get("/partidos", async (req, res): Promise<void> => {
  const query = GetPartidosQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions: SQL[] = [];

  if (query.data.semana != null) {
    conditions.push(sql`p.semana = ${query.data.semana}`);
  }
  if (query.data.equipoId != null) {
    conditions.push(
      sql`(p.local_id = ${query.data.equipoId} OR p.visitante_id = ${query.data.equipoId})`,
    );
  }
  if (query.data.desde != null) {
    conditions.push(sql`p.fecha >= ${query.data.desde}`);
  }
  if (query.data.hasta != null) {
    conditions.push(sql`p.fecha <= ${query.data.hasta}`);
  }
  const whereClause =
    conditions.length > 0 ? sql`AND ${sql.join(conditions, sql` AND `)}` : sql``;

  // Por defecto el torneo en curso; con ?temporada= se consulta uno ya
  // cerrado (ver lib/temporada.ts).
  const temporada = temporadaPedida(req);
  const rows = await db.execute(sql`
    SELECT p.*, l.nombre as local_nombre, v.nombre as visitante_nombre
    FROM partidos p
    JOIN equipos l ON l.id = p.local_id
    JOIN equipos v ON v.id = p.visitante_id
    WHERE ${filtroTemporadaSql("p.temporada", temporada)}
    ${whereClause}
    ORDER BY p.semana, p.fecha, p.hora
  `);
  const mapped = rows.rows.map(mapPartido);
  res.json(GetPartidosResponse.parse(mapped));
});

router.post("/partidos", requireAuth, writeAccess.partidos, async (req, res): Promise<void> => {
  const parsed = CreatePartidoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let data;
  try {
    data = normalizarWalkover(parsed.data);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Datos de W.O. inválidos" });
    return;
  }
  const [inserted] = await db.insert(partidosTable).values(data).returning();
  const row = await fetchPartidoWithTeams(inserted.id);
  if (!row) {
    res.status(500).json({ error: "Failed to fetch created partido" });
    return;
  }
  res.status(201).json(CreatePartidoResponse.parse(mapPartido(row)));
});

/**
 * Creación en lote, para el generador de calendario: el usuario arma la
 * programación de todas las jornadas, marca los partidos que sí va a jugar y
 * los guarda de una vez.
 *
 * Va todo en una transacción: o entran todos los partidos elegidos, o no entra
 * ninguno. Media programación guardada sería peor que ninguna, porque no se
 * vería a simple vista qué faltó.
 */
router.post("/partidos/lote", requireAuth, writeAccess.partidos, async (req, res): Promise<void> => {
  const parsed = CreatePartidosLoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { partidos } = parsed.data;

  if (partidos.some((p) => p.localId === p.visitanteId)) {
    res.status(400).json({ error: "Un equipo no puede jugar contra sí mismo" });
    return;
  }

  // Se validan los equipos aquí para poder responder con un mensaje claro:
  // dejar que falle la llave foránea daría un error de base de datos.
  const idsEquipos = [...new Set(partidos.flatMap((p) => [p.localId, p.visitanteId]))];
  const equiposExistentes = await db
    .select({ id: equiposTable.id })
    .from(equiposTable)
    .where(inArray(equiposTable.id, idsEquipos));
  if (equiposExistentes.length !== idsEquipos.length) {
    res.status(400).json({ error: "Alguno de los equipos del calendario ya no existe" });
    return;
  }

  const semanas = [...new Set(partidos.map((p) => p.semana))].sort((a, b) => a - b);

  const resultado = await db.transaction(async (tx) => {
    // Un mismo cruce en la misma semana no se programa dos veces. Protege
    // contra guardar el mismo calendario por accidente (doble clic, o volver
    // a generarlo con las mismas semanas).
    const existentes = await tx
      .select({
        semana: partidosTable.semana,
        localId: partidosTable.localId,
        visitanteId: partidosTable.visitanteId,
      })
      .from(partidosTable)
      .where(inArray(partidosTable.semana, semanas));

    const yaProgramados = new Set(existentes.map((e) => `${e.semana}:${e.localId}:${e.visitanteId}`));

    const aInsertar: typeof partidos = [];
    let omitidos = 0;
    for (const p of partidos) {
      const clave = `${p.semana}:${p.localId}:${p.visitanteId}`;
      if (yaProgramados.has(clave)) {
        omitidos++;
        continue;
      }
      yaProgramados.add(clave); // también evita repetidos dentro del mismo lote
      aInsertar.push(p);
    }

    if (aInsertar.length > 0) {
      await tx.insert(partidosTable).values(aInsertar);
    }

    return { creados: aInsertar.length, omitidos };
  });

  res.status(201).json(CreatePartidosLoteResponse.parse(resultado));
});

router.get("/partidos/:id", async (req, res): Promise<void> => {
  const params = GetPartidoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const row = await fetchPartidoWithTeams(params.data.id);
  if (!row) {
    res.status(404).json({ error: "Partido not found" });
    return;
  }
  res.json(GetPartidoResponse.parse(mapPartido(row)));
});

router.patch("/partidos/:id", requireAuth, writeAccess.partidos, async (req, res): Promise<void> => {
  const params = UpdatePartidoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePartidoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let data = parsed.data;
  if (data.walkover) {
    const [existente] = await db.select().from(partidosTable).where(eq(partidosTable.id, params.data.id));
    if (!existente) {
      res.status(404).json({ error: "Partido not found" });
      return;
    }
    try {
      data = normalizarWalkover(data, existente);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Datos de W.O. inválidos" });
      return;
    }
  }

  const [updated] = await db.update(partidosTable).set(data).where(eq(partidosTable.id, params.data.id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Partido not found" });
    return;
  }
  const row = await fetchPartidoWithTeams(updated.id);
  res.json(UpdatePartidoResponse.parse(mapPartido(row!)));
});

router.delete("/partidos/:id", requireAuth, writeAccess.partidos, async (req, res): Promise<void> => {
  const params = DeletePartidoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const [deleted] = await db.delete(partidosTable).where(eq(partidosTable.id, params.data.id)).returning();
    if (!deleted) {
      res.status(404).json({ error: "Partido not found" });
      return;
    }
    res.sendStatus(204);
  } catch (err) {
    if (respondIfDeleteBlocked(err, res, "este partido")) return;
    throw err;
  }
});

export default router;
