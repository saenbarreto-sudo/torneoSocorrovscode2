import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { GetGoleadoresResponse, GetVallasResponse } from "@workspace/api-zod";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/goleadores", async (_req, res): Promise<void> => {
  // "temporada IS NULL" = torneo actual (ver schema/partidos.ts). Sin este
  // filtro, un historial importado de una temporada pasada se sumaría a la
  // tabla de goleadores del torneo en curso.
  //
  // El gol se atribuye al equipo que le correspondía al jugador el día que
  // lo hizo (jugador_equipo_historial por rango de fecha), no a su equipo
  // actual: si un jugador se transfiere a mitad de torneo, sus goles
  // anteriores se quedan con el equipo viejo y arranca de cero con el
  // nuevo (mismo criterio que la ficha individual del jugador).
  const rows = await db.execute(sql`
    SELECT
      j.id as jugador_id,
      j.nombre as jugador_nombre,
      e.nombre as equipo_nombre,
      COALESCE(SUM(g.cantidad), 0)::int as total_goles
    FROM goles g
    JOIN jugadores j ON j.id = g.jugador_id
    -- LATERAL en vez de un LEFT JOIN normal: el día exacto de un traspaso
    -- el stint que se cierra y el que se abre comparten esa fecha límite
    -- (fecha_fin del viejo = fecha_inicio del nuevo = hoy), así que un gol
    -- de ese día calzaría con los dos a la vez y se contaría doble. Con
    -- LATERAL + ORDER BY ... LIMIT 1 nos quedamos con uno solo (el stint
    -- que empezó más reciente, o sea el equipo nuevo).
    LEFT JOIN LATERAL (
      SELECT heq.equipo_id
      FROM jugador_equipo_historial heq
      WHERE heq.jugador_id = g.jugador_id
        AND heq.fecha_inicio <= COALESCE(g.fecha, CURRENT_DATE)
        AND (heq.fecha_fin IS NULL OR heq.fecha_fin >= COALESCE(g.fecha, CURRENT_DATE))
      ORDER BY heq.fecha_inicio DESC
      LIMIT 1
    ) heq ON true
    JOIN equipos e ON e.id = COALESCE(heq.equipo_id, j.equipo_id)
    WHERE g.propio = false AND g.temporada IS NULL
    GROUP BY j.id, j.nombre, e.id, e.nombre
    HAVING SUM(g.cantidad) > 0
    ORDER BY total_goles DESC, j.nombre ASC
    LIMIT 10
  `);
  const data = (rows.rows ?? rows).map((r: Record<string, unknown>) => ({
    jugadorId: r.jugador_id,
    jugadorNombre: r.jugador_nombre,
    equipoNombre: r.equipo_nombre,
    totalGoles: Number(r.total_goles),
  }));
  res.json(GetGoleadoresResponse.parse(data));
});

/**
 * Valla menos vencida: goles recibidos por equipo, contando solo partidos
 * jugados. Los goles de un W.O. (6-0 automático) no cuentan aquí, porque
 * el reglamento los excluye de vallas y goleadores (Art. 23).
 *
 * Solo cuenta hasta el final de la fase de grupos (temporada regular,
 * grupos o liguilla) — apenas arranca la eliminación directa, esos goles ya
 * no suman más para este premio puntual (a diferencia de Goleadores y
 * Amonestados, que sí siguen sumando toda la eliminatoria). El tipo de cada
 * fase sale del catálogo "fases"; una fase sin registrar se trata como
 * eliminación (no cuenta), que es lo más seguro para no inflar el premio.
 */
router.get("/vallas", async (_req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT
      e.id as equipo_id,
      e.nombre as equipo_nombre,
      COUNT(p.id)::int as partidos_jugados,
      COALESCE(SUM(
        CASE WHEN p.local_id = e.id THEN p.goles_visitante
             WHEN p.visitante_id = e.id THEN p.goles_local
             ELSE 0 END
      ), 0)::int as goles_recibidos
    FROM equipos e
    LEFT JOIN partidos p
      ON (p.local_id = e.id OR p.visitante_id = e.id)
      AND p.jugado = true
      AND p.walkover = false
      AND p.temporada IS NULL
      AND (p.fase IS NULL OR COALESCE((SELECT f.tipo FROM fases f WHERE f.nombre = p.fase AND f.temporada IS NULL), 'eliminacion') != 'eliminacion')
    WHERE e.activo = true
    GROUP BY e.id, e.nombre
    ORDER BY goles_recibidos ASC, partidos_jugados DESC, e.nombre ASC
  `);
  const data = (rows.rows ?? rows).map((r: Record<string, unknown>) => ({
    equipoId: r.equipo_id,
    equipoNombre: r.equipo_nombre,
    partidosJugados: Number(r.partidos_jugados),
    golesRecibidos: Number(r.goles_recibidos),
    promedio:
      Number(r.partidos_jugados) > 0
        ? Number((Number(r.goles_recibidos) / Number(r.partidos_jugados)).toFixed(2))
        : 0,
  }));
  res.json(GetVallasResponse.parse(data));
});

export default router;
