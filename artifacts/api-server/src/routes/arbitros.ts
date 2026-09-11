import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, arbitrosTable, partidosTable } from "@workspace/db";
import { filtroTemporadaSql, temporadaPedida } from "../lib/temporada";
import { requireAuth, writeAccess } from "../lib/permissions";
import {
  GetArbitrosQueryParams,
  GetArbitrosResponse,
  CrearArbitroBody,
  CrearArbitroResponse,
  ActualizarArbitroParams,
  ActualizarArbitroBody,
  ActualizarArbitroResponse,
  BorrarArbitroParams,
  GetFichaArbitroParams,
  GetFichaArbitroResponse,
  GetEstadisticasArbitrosResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

/**
 * Estadísticas del árbitro: siempre se miran a través de sus partidos
 * (partidos.arbitro_id), nunca de un campo aparte. Lo pagado sale de los
 * egresos de categoría "Arbitraje" enlazados a esos mismos partidos
 * (egresos.partido_id) — así no hay que duplicar el id del árbitro ahí.
 */

router.get("/arbitros", async (req, res): Promise<void> => {
  const query = GetArbitrosQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const temporada = temporadaPedida(req);

  // No se usa query.data.activo: zod.coerce.boolean() convierte CUALQUIER
  // string no vacío a true (así es como funciona Boolean() en JS), así que
  // "?activo=false" quedaría leyéndose como true. Se lee el string crudo.
  const activo = typeof req.query.activo === "string" ? req.query.activo === "true" : null;

  const rows = await db.execute(sql`
    SELECT
      a.*,
      COUNT(p.id) FILTER (WHERE p.jugado = true AND ${filtroTemporadaSql("p.temporada", temporada)}) as partidos_dirigidos
    FROM arbitros a
    LEFT JOIN partidos p ON p.arbitro_id = a.id
    ${activo != null ? sql`WHERE a.activo = ${activo}` : sql``}
    ${query.data.buscar ? sql`${activo != null ? sql`AND` : sql`WHERE`} a.nombre ILIKE ${"%" + query.data.buscar + "%"}` : sql``}
    GROUP BY a.id
    ORDER BY a.activo DESC, partidos_dirigidos DESC, a.nombre
  `);

  const mapped = rows.rows.map((r: Record<string, unknown>) => ({
    id: Number(r.id),
    nombre: String(r.nombre),
    telefono: (r.telefono as string | null) ?? null,
    foto: (r.foto as string | null) ?? null,
    activo: Boolean(r.activo),
    notas: (r.notas as string | null) ?? null,
    partidosDirigidos: Number(r.partidos_dirigidos ?? 0),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
  res.json(GetArbitrosResponse.parse(mapped));
});

router.post("/arbitros", requireAuth, writeAccess.arbitros, async (req, res): Promise<void> => {
  const parsed = CrearArbitroBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [creado] = await db.insert(arbitrosTable).values(parsed.data).returning();
  res.status(201).json(
    CrearArbitroResponse.parse({ ...creado, createdAt: creado.createdAt.toISOString(), partidosDirigidos: 0 }),
  );
});

/**
 * DEBE declararse antes de "/arbitros/:id": si no, Express intentaría leer
 * "estadisticas" como si fuera un id numérico y nunca llegaría acá (mismo
 * problema que ya se resolvió con /mesas/resumen).
 */
router.get("/arbitros/estadisticas", async (req, res): Promise<void> => {
  const temporada = temporadaPedida(req);

  const rows = await db.execute(sql`
    SELECT
      a.id as arbitro_id,
      a.nombre as arbitro_nombre,
      a.activo,
      COUNT(DISTINCT p.id) as partidos_dirigidos,
      COALESCE(SUM(t.amarillas), 0)::int as amarillas,
      COALESCE(SUM(t.rojas), 0)::int as rojas,
      COALESCE(SUM(e.valor), 0)::int as total_pagado
    FROM arbitros a
    JOIN partidos p ON p.arbitro_id = a.id AND p.jugado = true AND ${filtroTemporadaSql("p.temporada", temporada)}
    LEFT JOIN (
      SELECT partido_id,
             COUNT(*) FILTER (WHERE tipo = 'amarilla') as amarillas,
             COUNT(*) FILTER (WHERE tipo = 'roja') as rojas
      FROM tarjetas WHERE partido_id IS NOT NULL GROUP BY partido_id
    ) t ON t.partido_id = p.id
    LEFT JOIN egresos e ON e.partido_id = p.id AND e.categoria = 'Arbitraje'
    GROUP BY a.id
    ORDER BY partidos_dirigidos DESC, a.nombre
  `);

  const arbitros = rows.rows.map((r: Record<string, unknown>) => ({
    arbitroId: Number(r.arbitro_id),
    arbitroNombre: String(r.arbitro_nombre),
    activo: Boolean(r.activo),
    partidosDirigidos: Number(r.partidos_dirigidos ?? 0),
    amarillas: Number(r.amarillas ?? 0),
    rojas: Number(r.rojas ?? 0),
    totalPagado: Number(r.total_pagado ?? 0),
  }));

  res.json(
    GetEstadisticasArbitrosResponse.parse({
      arbitros,
      totalPartidos: arbitros.reduce((s, a) => s + a.partidosDirigidos, 0),
      totalPagado: arbitros.reduce((s, a) => s + a.totalPagado, 0),
    }),
  );
});

router.patch("/arbitros/:id", requireAuth, writeAccess.arbitros, async (req, res): Promise<void> => {
  const params = ActualizarArbitroParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = ActualizarArbitroBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [actualizado] = await db
    .update(arbitrosTable)
    .set(parsed.data)
    .where(eq(arbitrosTable.id, params.data.id))
    .returning();
  if (!actualizado) {
    res.status(404).json({ error: "Árbitro no encontrado" });
    return;
  }
  const conteo = await db.execute(sql`
    SELECT COUNT(*)::int as partidos_dirigidos FROM partidos WHERE arbitro_id = ${actualizado.id} AND jugado = true
  `);
  const partidosDirigidos = Number(conteo.rows[0]?.partidos_dirigidos ?? 0);
  res.json(
    ActualizarArbitroResponse.parse({
      ...actualizado,
      createdAt: actualizado.createdAt.toISOString(),
      partidosDirigidos,
    }),
  );
});

/**
 * Borrar un árbitro es para deshacer un alta equivocada (un duplicado, un
 * nombre mal escrito), no para "sacar" a alguien que ya trabajó: si tiene
 * partidos a su nombre, borrarlo los dejaría sin árbitro y sin forma de
 * saber quién los dirigió. En ese caso lo correcto es desactivarlo, que es
 * lo que sugiere el mensaje.
 */
router.delete("/arbitros/:id", requireAuth, writeAccess.arbitros, async (req, res): Promise<void> => {
  const params = BorrarArbitroParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = params.data.id;

  const [arbitro] = await db.select().from(arbitrosTable).where(eq(arbitrosTable.id, id));
  if (!arbitro) {
    res.status(404).json({ error: "Árbitro no encontrado" });
    return;
  }

  const conteo = await db.execute(sql`
    SELECT COUNT(*)::int as partidos FROM partidos WHERE arbitro_id = ${id}
  `);
  const partidos = Number(conteo.rows[0]?.partidos ?? 0);
  if (partidos > 0) {
    res.status(409).json({
      error:
        `No se puede borrar a ${arbitro.nombre} porque tiene ${partidos} partido(s) a su nombre; ` +
        `borrarlo dejaría esos partidos sin saber quién los dirigió. ` +
        `Si ya no arbitra, desactívalo: deja de aparecer para asignarlo, pero se conserva su historial.`,
    });
    return;
  }

  await db.delete(arbitrosTable).where(eq(arbitrosTable.id, id));
  res.sendStatus(204);
});

router.get("/arbitros/:id/estadisticas", async (req, res): Promise<void> => {
  const params = GetFichaArbitroParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = params.data.id;
  const temporada = temporadaPedida(req);

  const [arbitro] = await db.select().from(arbitrosTable).where(eq(arbitrosTable.id, id));
  if (!arbitro) {
    res.status(404).json({ error: "Árbitro no encontrado" });
    return;
  }

  // ── Historial: todos los partidos YA JUGADOS que dirigió, con lo que se
  // le pagó en cada uno y las tarjetas mostradas en ese partido. ──
  const historialRows = await db.execute(sql`
    SELECT
      p.id as partido_id, p.fecha, p.semana, p.fase,
      l.nombre as local_nombre, v.nombre as visitante_nombre,
      p.goles_local, p.goles_visitante,
      COALESCE(t.amarillas, 0)::int as amarillas,
      COALESCE(t.rojas, 0)::int as rojas,
      e.valor as pagado
    FROM partidos p
    JOIN equipos l ON l.id = p.local_id
    JOIN equipos v ON v.id = p.visitante_id
    LEFT JOIN (
      SELECT partido_id,
             COUNT(*) FILTER (WHERE tipo = 'amarilla') as amarillas,
             COUNT(*) FILTER (WHERE tipo = 'roja') as rojas
      FROM tarjetas WHERE partido_id IS NOT NULL GROUP BY partido_id
    ) t ON t.partido_id = p.id
    LEFT JOIN egresos e ON e.partido_id = p.id AND e.categoria = 'Arbitraje'
    WHERE p.arbitro_id = ${id} AND p.jugado = true AND ${filtroTemporadaSql("p.temporada", temporada)}
    ORDER BY p.fecha DESC NULLS LAST, p.semana DESC
  `);

  const historial = historialRows.rows.map((r: Record<string, unknown>) => ({
    partidoId: Number(r.partido_id),
    fecha: (r.fecha as string | null) ?? null,
    semana: Number(r.semana),
    fase: (r.fase as string | null) ?? null,
    localNombre: String(r.local_nombre),
    visitanteNombre: String(r.visitante_nombre),
    golesLocal: r.goles_local == null ? null : Number(r.goles_local),
    golesVisitante: r.goles_visitante == null ? null : Number(r.goles_visitante),
    amarillas: Number(r.amarillas ?? 0),
    rojas: Number(r.rojas ?? 0),
    pagado: r.pagado == null ? null : Number(r.pagado),
  }));

  // ── Próximos: lo que ya tiene asignado pero todavía no se ha jugado. ──
  const proximosRows = await db.execute(sql`
    SELECT p.id as partido_id, p.fecha, p.hora, p.semana, p.fase,
           l.nombre as local_nombre, v.nombre as visitante_nombre
    FROM partidos p
    JOIN equipos l ON l.id = p.local_id
    JOIN equipos v ON v.id = p.visitante_id
    WHERE p.arbitro_id = ${id} AND p.jugado = false AND ${filtroTemporadaSql("p.temporada", temporada)}
    ORDER BY p.fecha ASC NULLS LAST, p.semana ASC
  `);
  const proximos = proximosRows.rows.map((r: Record<string, unknown>) => ({
    partidoId: Number(r.partido_id),
    fecha: (r.fecha as string | null) ?? null,
    hora: (r.hora as string | null) ?? null,
    semana: Number(r.semana),
    fase: (r.fase as string | null) ?? null,
    localNombre: String(r.local_nombre),
    visitanteNombre: String(r.visitante_nombre),
  }));

  // ── Resumen ──
  const resumen = historial.reduce(
    (acc, h) => ({
      partidosDirigidos: acc.partidosDirigidos + 1,
      amarillas: acc.amarillas + h.amarillas,
      rojas: acc.rojas + h.rojas,
      totalPagado: acc.totalPagado + (h.pagado ?? 0),
    }),
    { partidosDirigidos: 0, amarillas: 0, rojas: 0, totalPagado: 0 },
  );

  // ── Por equipo: cuántas veces dirigió a cada equipo (local o visitante). ──
  const porEquipoMap = new Map<string, number>();
  for (const h of historial) {
    porEquipoMap.set(h.localNombre, (porEquipoMap.get(h.localNombre) ?? 0) + 1);
    porEquipoMap.set(h.visitanteNombre, (porEquipoMap.get(h.visitanteNombre) ?? 0) + 1);
  }
  const equiposRows = await db.execute(sql`SELECT id, nombre FROM equipos`);
  const idPorNombre = new Map(equiposRows.rows.map((r: Record<string, unknown>) => [String(r.nombre), Number(r.id)]));
  const porEquipo = [...porEquipoMap.entries()]
    .map(([equipoNombre, partidos]) => ({ equipoId: idPorNombre.get(equipoNombre) ?? 0, equipoNombre, partidos }))
    .sort((a, b) => b.partidos - a.partidos);

  // ── Por fase ──
  const porFaseMap = new Map<string, number>();
  for (const h of historial) {
    const fase = h.fase ?? "Sin fase";
    porFaseMap.set(fase, (porFaseMap.get(fase) ?? 0) + 1);
  }
  const porFase = [...porFaseMap.entries()].map(([fase, partidos]) => ({ fase, partidos }));

  // ── Carga en el tiempo: partidos por fecha. ──
  const porFechaMap = new Map<string, number>();
  for (const h of historial) {
    if (!h.fecha) continue;
    porFechaMap.set(h.fecha, (porFechaMap.get(h.fecha) ?? 0) + 1);
  }
  const partidosPorFecha = [...porFechaMap.entries()]
    .map(([fecha, partidos]) => ({ fecha, partidos }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  res.json(
    GetFichaArbitroResponse.parse({
      arbitro: {
        ...arbitro,
        createdAt: arbitro.createdAt.toISOString(),
        partidosDirigidos: resumen.partidosDirigidos,
      },
      resumen,
      porEquipo,
      porFase,
      partidosPorFecha,
      historial,
      proximos,
    }),
  );
});

export default router;
