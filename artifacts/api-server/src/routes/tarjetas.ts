import { Router, type IRouter } from "express";
import { eq, sql, type SQL } from "drizzle-orm";
import { db, tarjetasTable, jugadoresTable, equiposTable } from "@workspace/db";
import { requireAuth, writeAccess } from "../lib/permissions";
import { respondIfDeleteBlocked } from "../lib/delete-errors";
import {
  CreateTarjetaBody,
  CreateTarjetaResponse,
  GetTarjetasResponse,
  GetTarjetasQueryParams,
  UpdateTarjetaBody,
  UpdateTarjetaParams,
  UpdateTarjetaResponse,
  DeleteTarjetaParams,
  GetAmonestadosResponse,
  GetSancionesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function mapTarjeta(row: Record<string, unknown>) {
  return {
    id: row.id,
    jugadorId: row.jugador_id ?? row.jugadorId,
    jugadorNombre: row.jugador_nombre ?? row.jugadorNombre,
    equipoNombre: row.equipo_nombre ?? row.equipoNombre,
    tipo: row.tipo,
    semana: row.semana,
    fecha: row.fecha ?? null,
    partidoId: row.partido_id ?? null,
    valor: row.valor ?? null,
    pagada: row.pagada,
    sancion: row.sancion ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

router.get("/tarjetas", async (req, res): Promise<void> => {
  const query = GetTarjetasQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions: SQL[] = [];
  if (query.data.tipo) {
    conditions.push(sql`t.tipo = ${query.data.tipo}`);
  }
  if (query.data.jugadorId != null) {
    conditions.push(sql`t.jugador_id = ${query.data.jugadorId}`);
  }
  if (query.data.partidoId != null) {
    conditions.push(sql`t.partido_id = ${query.data.partidoId}`);
  }
  const whereClause =
    conditions.length > 0 ? sql`AND ${sql.join(conditions, sql` AND `)}` : sql``;

  const rows = await db.execute(sql`
    SELECT t.*, j.nombre as jugador_nombre, e.nombre as equipo_nombre
    FROM tarjetas t
    JOIN jugadores j ON j.id = t.jugador_id
    JOIN equipos e ON e.id = j.equipo_id
    WHERE 1=1
    ${whereClause}
    ORDER BY t.semana DESC, t.created_at DESC
  `);
  const data = rows.rows.map(mapTarjeta);
  res.json(GetTarjetasResponse.parse(data));
});

/**
 * Reglas del reglamento: la tarjeta amarilla no genera sanción en fechas
 * (solo multa en dinero, que es obligatoria); la tarjeta roja sí puede
 * llevar sanción en fechas, pero es opcional (el Comité/Mesa la define caso
 * por caso), y su multa en dinero también es opcional.
 */
function normalizeTarjetaFields<T extends { tipo?: string; valor?: number | null; sancion?: string | null }>(
  data: T,
): { ok: true; data: T } | { ok: false; error: string } {
  if (data.tipo === "amarilla") {
    if (data.valor == null || data.valor <= 0) {
      return { ok: false, error: "El valor de la multa es obligatorio para tarjetas amarillas" };
    }
    return { ok: true, data: { ...data, sancion: null } };
  }
  return { ok: true, data };
}

router.post("/tarjetas", requireAuth, writeAccess.tarjetas, async (req, res): Promise<void> => {
  const parsed = CreateTarjetaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const normalized = normalizeTarjetaFields(parsed.data);
  if (!normalized.ok) {
    res.status(400).json({ error: normalized.error });
    return;
  }
  const [inserted] = await db.insert(tarjetasTable).values(normalized.data).returning();
  const [jugador] = await db
    .select({ nombre: jugadoresTable.nombre, equipoNombre: equiposTable.nombre })
    .from(jugadoresTable)
    .innerJoin(equiposTable, eq(jugadoresTable.equipoId, equiposTable.id))
    .where(eq(jugadoresTable.id, inserted.jugadorId));
  res.status(201).json(CreateTarjetaResponse.parse({
    ...inserted,
    jugadorNombre: jugador?.nombre ?? "",
    equipoNombre: jugador?.equipoNombre ?? "",
    createdAt: inserted.createdAt.toISOString(),
  }));
});

router.patch("/tarjetas/:id", requireAuth, writeAccess.tarjetas, async (req, res): Promise<void> => {
  const params = UpdateTarjetaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTarjetaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(tarjetasTable).where(eq(tarjetasTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Tarjeta not found" });
    return;
  }
  const merged = { ...existing, ...parsed.data };
  const normalized = normalizeTarjetaFields(merged);
  if (!normalized.ok) {
    res.status(400).json({ error: normalized.error });
    return;
  }
  const updateData = { ...parsed.data, ...(merged.tipo === "amarilla" ? { sancion: null } : {}) };

  const [updated] = await db.update(tarjetasTable).set(updateData).where(eq(tarjetasTable.id, params.data.id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Tarjeta not found" });
    return;
  }
  const [jugador] = await db
    .select({ nombre: jugadoresTable.nombre, equipoNombre: equiposTable.nombre })
    .from(jugadoresTable)
    .innerJoin(equiposTable, eq(jugadoresTable.equipoId, equiposTable.id))
    .where(eq(jugadoresTable.id, updated.jugadorId));
  res.json(UpdateTarjetaResponse.parse({
    ...updated,
    jugadorNombre: jugador?.nombre ?? "",
    equipoNombre: jugador?.equipoNombre ?? "",
    createdAt: updated.createdAt.toISOString(),
  }));
});

router.delete("/tarjetas/:id", requireAuth, writeAccess.tarjetas, async (req, res): Promise<void> => {
  const params = DeleteTarjetaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const [deleted] = await db.delete(tarjetasTable).where(eq(tarjetasTable.id, params.data.id)).returning();
    if (!deleted) {
      res.status(404).json({ error: "Tarjeta not found" });
      return;
    }
    res.sendStatus(204);
  } catch (err) {
    if (respondIfDeleteBlocked(err, res, "esta tarjeta")) return;
    throw err;
  }
});

router.get("/amonestados", async (_req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT
      j.id as jugador_id,
      j.nombre as jugador_nombre,
      e.nombre as equipo_nombre,
      COUNT(CASE WHEN t.tipo = 'amarilla' AND t.pagada = false THEN 1 END)::int as amarillas,
      COUNT(CASE WHEN t.tipo = 'roja' THEN 1 END)::int as rojas,
      SUM(CASE WHEN t.tipo = 'roja' THEN 2 WHEN t.tipo = 'amarilla' AND t.pagada = false THEN 1 ELSE 0 END)::int as sancion_fechas
    FROM jugadores j
    JOIN equipos e ON e.id = j.equipo_id
    JOIN tarjetas t ON t.jugador_id = j.id
    GROUP BY j.id, j.nombre, e.nombre
    HAVING COUNT(CASE WHEN t.tipo = 'roja' OR (t.tipo = 'amarilla' AND t.pagada = false) THEN 1 END) > 0
    ORDER BY rojas DESC, amarillas DESC
  `);
  const data = (rows.rows ?? rows).map((r: Record<string, unknown>) => ({
    jugadorId: r.jugador_id,
    jugadorNombre: r.jugador_nombre,
    equipoNombre: r.equipo_nombre,
    amarillas: Number(r.amarillas ?? 0),
    rojas: Number(r.rojas ?? 0),
    sancionFechas: Number(r.sancion_fechas ?? 0),
  }));
  res.json(GetAmonestadosResponse.parse(data));
});

/**
 * Sanciones vigentes: por cada tarjeta con fechas de suspensión, calcula
 * cuántas fechas ya cumplió el jugador y cuántas le faltan.
 *
 * Una fecha se considera cumplida cuando el equipo del jugador disputó un
 * partido POSTERIOR al de la tarjeta y el jugador NO apareció en la
 * planilla de ese partido. Así, si su equipo juega el fin de semana
 * siguiente y él no está en la planilla, la sanción baja sola de 2 a 1.
 */
router.get("/sanciones", async (_req, res): Promise<void> => {
  const rows = await db.execute(sql`
    WITH sancionadas AS (
      SELECT
        t.id            as tarjeta_id,
        t.jugador_id,
        t.tipo,
        t.fechas_sancion,
        t.semana        as semana_tarjeta,
        t.fecha         as fecha_tarjeta,
        j.nombre        as jugador_nombre,
        j.equipo_id,
        e.nombre        as equipo_nombre,
        p.id            as partido_tarjeta_id
      FROM tarjetas t
      JOIN jugadores j ON j.id = t.jugador_id
      JOIN equipos   e ON e.id = j.equipo_id
      LEFT JOIN partidos p ON p.id = t.partido_id
      WHERE t.fechas_sancion > 0
    )
    SELECT
      s.*,
      (
        SELECT COUNT(*)::int
        FROM partidos pp
        WHERE pp.jugado = true
          AND (pp.local_id = s.equipo_id OR pp.visitante_id = s.equipo_id)
          AND (
            pp.semana > s.semana_tarjeta
            OR (pp.semana = s.semana_tarjeta AND s.partido_tarjeta_id IS NOT NULL AND pp.id > s.partido_tarjeta_id)
          )
          AND NOT EXISTS (
            SELECT 1 FROM planilla pl
            WHERE pl.partido_id = pp.id AND pl.jugador_id = s.jugador_id
          )
      ) as fechas_cumplidas
    FROM sancionadas s
    ORDER BY s.equipo_nombre, s.jugador_nombre
  `);

  const data = (rows.rows ?? rows).map((r: Record<string, unknown>) => {
    const total = Number(r.fechas_sancion);
    const cumplidas = Math.min(Number(r.fechas_cumplidas), total);
    return {
      tarjetaId: Number(r.tarjeta_id),
      jugadorId: Number(r.jugador_id),
      jugadorNombre: String(r.jugador_nombre),
      equipoId: Number(r.equipo_id),
      equipoNombre: String(r.equipo_nombre),
      tipo: String(r.tipo),
      semana: Number(r.semana_tarjeta),
      fecha: r.fecha_tarjeta == null ? null : String(r.fecha_tarjeta),
      fechasSancion: total,
      fechasCumplidas: cumplidas,
      fechasPendientes: Math.max(0, total - cumplidas),
    };
  });

  res.json(GetSancionesResponse.parse(data));
});

export default router;
