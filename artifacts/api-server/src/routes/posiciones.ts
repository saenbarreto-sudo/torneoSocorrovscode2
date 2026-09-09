import { Router, type IRouter } from "express";
import { db, fasesTable } from "@workspace/db";
import { requireAuth, writeAccess } from "../lib/permissions";
import {
  GetPosicionesResponse,
  GetPosicionesQueryParams,
  GetFasesResponse,
  CreateFasesLoteBody,
  CreateFasesLoteResponse,
} from "@workspace/api-zod";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// Fases "de temporada regular": si no se pide una fase puntual, la tabla
// general junta estas dos más los partidos sin fase asignada (partidos
// viejos o cargados a mano sin ese campo). Cualquier otro texto en `fase`
// (Liguilla, Cuartos, Semifinal...) se ve aparte, para no mezclar la fase
// final con la tabla de la temporada regular.
const FASES_TEMPORADA_REGULAR = ["Primera vuelta", "Segunda vuelta"];

router.get("/posiciones", async (req, res): Promise<void> => {
  const query = GetPosicionesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const filtroFase = query.data.fase
    ? sql`AND p.fase = ${query.data.fase}`
    : sql`AND (p.fase IS NULL OR p.fase IN (${sql.join(FASES_TEMPORADA_REGULAR.map((f) => sql`${f}`), sql`, `)}))`;

  // Para la Tabla general interesa ver a TODOS los equipos activos, aunque
  // alguno no haya jugado nada todavía. Pero al pedir una fase puntual (un
  // grupo, una liguilla, una ronda de eliminación), solo tiene sentido
  // mostrar a los equipos que de verdad están en esa fase — si no, cada
  // grupo saldría con los 9 equipos del torneo en vez de solo los suyos.
  const filtroEquipoEnFase = query.data.fase
    ? sql`AND EXISTS (
        SELECT 1 FROM partidos px
        WHERE (px.local_id = e.id OR px.visitante_id = e.id)
          AND px.temporada IS NULL
          AND px.fase = ${query.data.fase}
      )`
    : sql``;

  // "AND p.temporada IS NULL" en los JOIN de abajo: solo el torneo actual
  // (ver schema/partidos.ts). Sin eso, un historial importado de una
  // temporada pasada se mezclaría con la tabla de posiciones en curso.
  const rows = await db.execute(sql`
    WITH partidos_jugados AS (
      SELECT
        e.id as equipo_id,
        e.nombre as equipo_nombre,
        e.puntos_bonificacion as puntos_bonificacion,
        -- Total
        COUNT(CASE WHEN (p.local_id = e.id OR p.visitante_id = e.id) AND p.jugado THEN 1 END)::int as pj,
        COUNT(CASE WHEN p.jugado AND (
          (p.local_id = e.id AND p.goles_local > p.goles_visitante) OR
          (p.visitante_id = e.id AND p.goles_visitante > p.goles_local)
        ) THEN 1 END)::int as pg,
        COUNT(CASE WHEN p.jugado AND p.goles_local = p.goles_visitante AND (p.local_id = e.id OR p.visitante_id = e.id) THEN 1 END)::int as pe,
        COUNT(CASE WHEN p.jugado AND (
          (p.local_id = e.id AND p.goles_local < p.goles_visitante) OR
          (p.visitante_id = e.id AND p.goles_visitante < p.goles_local)
        ) THEN 1 END)::int as pp,
        COALESCE(SUM(CASE WHEN p.jugado AND p.local_id = e.id THEN p.goles_local
                          WHEN p.jugado AND p.visitante_id = e.id THEN p.goles_visitante ELSE 0 END), 0)::int as gf,
        COALESCE(SUM(CASE WHEN p.jugado AND p.local_id = e.id THEN p.goles_visitante
                          WHEN p.jugado AND p.visitante_id = e.id THEN p.goles_local ELSE 0 END), 0)::int as gc,
        -- Local
        COUNT(CASE WHEN p.local_id = e.id AND p.jugado THEN 1 END)::int as pj_local,
        COUNT(CASE WHEN p.local_id = e.id AND p.jugado AND p.goles_local > p.goles_visitante THEN 1 END)::int as pg_local,
        COUNT(CASE WHEN p.local_id = e.id AND p.jugado AND p.goles_local = p.goles_visitante THEN 1 END)::int as pe_local,
        COUNT(CASE WHEN p.local_id = e.id AND p.jugado AND p.goles_local < p.goles_visitante THEN 1 END)::int as pp_local,
        COALESCE(SUM(CASE WHEN p.local_id = e.id AND p.jugado THEN p.goles_local ELSE 0 END), 0)::int as gf_local,
        COALESCE(SUM(CASE WHEN p.local_id = e.id AND p.jugado THEN p.goles_visitante ELSE 0 END), 0)::int as gc_local,
        -- Visitante
        COUNT(CASE WHEN p.visitante_id = e.id AND p.jugado THEN 1 END)::int as pj_visitante,
        COUNT(CASE WHEN p.visitante_id = e.id AND p.jugado AND p.goles_visitante > p.goles_local THEN 1 END)::int as pg_visitante,
        COUNT(CASE WHEN p.visitante_id = e.id AND p.jugado AND p.goles_visitante = p.goles_local THEN 1 END)::int as pe_visitante,
        COUNT(CASE WHEN p.visitante_id = e.id AND p.jugado AND p.goles_visitante < p.goles_local THEN 1 END)::int as pp_visitante,
        COALESCE(SUM(CASE WHEN p.visitante_id = e.id AND p.jugado THEN p.goles_visitante ELSE 0 END), 0)::int as gf_visitante,
        COALESCE(SUM(CASE WHEN p.visitante_id = e.id AND p.jugado THEN p.goles_local ELSE 0 END), 0)::int as gc_visitante
      FROM equipos e
      LEFT JOIN partidos p ON (p.local_id = e.id OR p.visitante_id = e.id) AND p.temporada IS NULL ${filtroFase}
      WHERE e.activo = true ${filtroEquipoEnFase}
      GROUP BY e.id, e.nombre, e.puntos_bonificacion
    ),
    fairplay AS (
      -- Puntaje de fair play: amarilla = 10, roja = 20. Solo se cuentan
      -- tarjetas de partidos ya jugados. Menos puntaje = mejor comportamiento.
      SELECT
        j.equipo_id as equipo_id,
        COALESCE(SUM(CASE WHEN t.tipo = 'amarilla' THEN 10 WHEN t.tipo = 'roja' THEN 20 ELSE 0 END), 0)::int as puntaje_fairplay
      FROM tarjetas t
      JOIN jugadores j ON j.id = t.jugador_id
      JOIN partidos p ON p.id = t.partido_id
      WHERE p.jugado = true AND p.temporada IS NULL ${filtroFase}
      GROUP BY j.equipo_id
    )
    SELECT
      -- Desempate según Art. 19 del reglamento: 1) puntos de partido,
      -- 2) puntos de bonificación (solo aplica a los 4 de la liguilla),
      -- 3) diferencia de goles, 4) fair play (menos tarjetas = mejor),
      -- 5) goles marcados, 6) menos goles recibidos, 7) [enfrentamiento
      -- directo, pendiente].
      ROW_NUMBER() OVER (
        ORDER BY (pg*3 + pe) DESC, puntos_bonificacion DESC, (gf - gc) DESC,
                 COALESCE(fp.puntaje_fairplay, 0) ASC, gf DESC, gc ASC
      ) as posicion,
      partidos_jugados.equipo_id,
      equipo_nombre,
      puntos_bonificacion,
      COALESCE(fp.puntaje_fairplay, 0)::int as puntaje_fairplay,
      pj, pg, pe, pp, gf, gc, (gf - gc)::int as df, (pg*3 + pe)::int as pts,
      pj_local, pg_local, pe_local, pp_local, gf_local, gc_local,
      pj_visitante, pg_visitante, pe_visitante, pp_visitante, gf_visitante, gc_visitante
    FROM partidos_jugados
    LEFT JOIN fairplay fp ON fp.equipo_id = partidos_jugados.equipo_id
    ORDER BY pts DESC, puntos_bonificacion DESC, df DESC, puntaje_fairplay ASC, gf DESC, gc ASC
  `);

  const data = (rows.rows ?? rows).map((r: Record<string, unknown>) => ({
    posicion: Number(r.posicion),
    equipoId: r.equipo_id,
    equipoNombre: r.equipo_nombre,
    puntosBonificacion: Number(r.puntos_bonificacion ?? 0),
    puntajeFairplay: Number(r.puntaje_fairplay ?? 0),
    pj: Number(r.pj), pg: Number(r.pg), pe: Number(r.pe), pp: Number(r.pp),
    gf: Number(r.gf), gc: Number(r.gc), df: Number(r.df), pts: Number(r.pts),
    pjLocal: Number(r.pj_local), pgLocal: Number(r.pg_local), peLocal: Number(r.pe_local), ppLocal: Number(r.pp_local),
    gfLocal: Number(r.gf_local), gcLocal: Number(r.gc_local),
    pjVisitante: Number(r.pj_visitante), pgVisitante: Number(r.pg_visitante), peVisitante: Number(r.pe_visitante), ppVisitante: Number(r.pp_visitante),
    gfVisitante: Number(r.gf_visitante), gcVisitante: Number(r.gc_visitante),
  }));
  res.json(GetPosicionesResponse.parse(data));
});

router.get("/fases", async (_req, res): Promise<void> => {
  // Solo fases con partidos de verdad en el torneo actual (no todo lo que
  // esté registrado en el catálogo "fases" — ese puede traer fijas como
  // "Muerte súbita" que todavía nadie usó). El tipo sale del catálogo si ya
  // se registró; si no (dato viejo, o un texto libre que alguien escribió
  // antes de que esto existiera), "eliminacion" es el valor por defecto más
  // seguro para no inflar la valla menos vencida sin querer.
  const rows = await db.execute(sql`
    SELECT DISTINCT p.fase as nombre, COALESCE(f.tipo, 'eliminacion') as tipo, COALESCE(f.orden, 999999) as orden
    FROM partidos p
    LEFT JOIN fases f ON f.nombre = p.fase
    WHERE p.temporada IS NULL
      AND p.fase IS NOT NULL
      AND p.fase NOT IN (${sql.join(FASES_TEMPORADA_REGULAR.map((f) => sql`${f}`), sql`, `)})
    ORDER BY orden ASC, nombre ASC
  `);
  const data = (rows.rows ?? rows).map((r: Record<string, unknown>) => ({
    nombre: String(r.nombre),
    tipo: String(r.tipo),
    orden: Number(r.orden),
  }));
  res.json(GetFasesResponse.parse(data));
});

router.post("/fases", requireAuth, writeAccess.partidos, async (req, res): Promise<void> => {
  const parsed = CreateFasesLoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { fases } = parsed.data;

  let registradas = 0;
  let omitidas = 0;
  for (const fase of fases) {
    const resultado = await db
      .insert(fasesTable)
      .values({ nombre: fase.nombre, tipo: fase.tipo })
      .onConflictDoNothing({ target: fasesTable.nombre })
      .returning({ nombre: fasesTable.nombre });
    if (resultado.length > 0) registradas++;
    else omitidas++;
  }

  res.status(201).json(CreateFasesLoteResponse.parse({ registradas, omitidas }));
});

export default router;
