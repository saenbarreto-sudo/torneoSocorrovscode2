import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { GetDashboardResumenResponse } from "@workspace/api-zod";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard/resumen", async (_req, res): Promise<void> => {
  const statsResult = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM equipos WHERE activo = true) as total_equipos,
      (SELECT COUNT(*)::int FROM jugadores WHERE activo = true) as total_jugadores,
      (SELECT COUNT(*)::int FROM partidos WHERE jugado = true) as total_partidos_jugados,
      (SELECT COUNT(*)::int FROM partidos) as total_partidos_programados,
      (SELECT COALESCE(SUM(cantidad), 0)::int FROM goles WHERE propio = false) as total_goles,
      (SELECT COUNT(*)::int FROM tarjetas WHERE tipo = 'amarilla') as total_amarillas,
      (SELECT COUNT(*)::int FROM tarjetas WHERE tipo = 'roja') as total_rojas,
      (SELECT COALESCE(SUM(monto), 0)::int FROM pagos) as recaudacion_total,
      (SELECT p.fecha_desde FROM programacion p WHERE p.fecha_desde > CURRENT_DATE ORDER BY p.fecha_desde LIMIT 1) as proxima_fecha
  `);
  const statsRows = (statsResult.rows ?? statsResult) as Record<string, unknown>[];
  const stats = statsRows[0];

  // Top goleador
  const topGolResult = await db.execute(sql`
    SELECT j.id as jugador_id, j.nombre as jugador_nombre, e.nombre as equipo_nombre, COALESCE(SUM(g.cantidad), 0)::int as total_goles
    FROM jugadores j
    JOIN equipos e ON e.id = j.equipo_id
    JOIN goles g ON g.jugador_id = j.id
    WHERE g.propio = false
    GROUP BY j.id, j.nombre, e.nombre
    ORDER BY total_goles DESC
    LIMIT 1
  `);
  const topGolRows = (topGolResult.rows ?? topGolResult) as Record<string, unknown>[];
  const topGol = topGolRows[0];

  const resumen = {
    totalEquipos: Number(stats?.total_equipos ?? 0),
    totalJugadores: Number(stats?.total_jugadores ?? 0),
    totalPartidosJugados: Number(stats?.total_partidos_jugados ?? 0),
    totalPartidosProgramados: Number(stats?.total_partidos_programados ?? 0),
    totalGoles: Number(stats?.total_goles ?? 0),
    totalAmarillas: Number(stats?.total_amarillas ?? 0),
    totalRojas: Number(stats?.total_rojas ?? 0),
    recaudacionTotal: Number(stats?.recaudacion_total ?? 0),
    proximaFecha: stats?.proxima_fecha ? String(stats.proxima_fecha) : null,
    topGoleador: topGol ? {
      jugadorId: Number(topGol.jugador_id),
      jugadorNombre: String(topGol.jugador_nombre),
      equipoNombre: String(topGol.equipo_nombre),
      totalGoles: Number(topGol.total_goles),
    } : {
      jugadorId: 0,
      jugadorNombre: "Sin datos",
      equipoNombre: "-",
      totalGoles: 0,
    },
  };

  res.json(GetDashboardResumenResponse.parse(resumen));
});

export default router;
