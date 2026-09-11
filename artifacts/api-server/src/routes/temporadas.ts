import { Router, type IRouter } from "express";
import { desc, isNull, sql } from "drizzle-orm";
import {
  db,
  temporadasTable,
  partidosTable,
  golesTable,
  tarjetasTable,
  pagosTable,
  egresosTable,
  mesasTable,
  programacionTable,
  fasesTable,
  equiposTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../lib/require-auth";

const router: IRouter = Router();

/**
 * Cerrar un torneo y dejar la casa lista para el siguiente, SIN borrar
 * nada.
 *
 * Todo lo del torneo en curso se reconoce porque no lleva sello de
 * temporada (`temporada IS NULL`). Cerrar consiste en ponerle a todo eso el
 * sello del torneo que termina: desde ese momento las pantallas en vivo
 * dejan de verlo (todas filtran por NULL) y el torneo nuevo arranca vacío,
 * con los datos viejos intactos y consultables.
 *
 * Va todo en una sola transacción: si algo falla a mitad de camino, no
 * queda un torneo cerrado a medias.
 */

/** Las tablas que llevan el sello, en el orden en que se sellan. */
const TABLAS_DEL_TORNEO = [
  { nombre: "partidos", tabla: partidosTable },
  { nombre: "goles", tabla: golesTable },
  { nombre: "tarjetas", tabla: tarjetasTable },
  { nombre: "pagos", tabla: pagosTable },
  { nombre: "egresos", tabla: egresosTable },
  { nombre: "mesas", tabla: mesasTable },
  { nombre: "programacion", tabla: programacionTable },
  { nombre: "fases", tabla: fasesTable },
] as const;

router.get("/temporadas", requireAuth, async (_req, res): Promise<void> => {
  const filas = await db.select().from(temporadasTable).orderBy(desc(temporadasTable.nombre));
  res.json(
    filas.map((t) => ({
      nombre: t.nombre,
      cerradaAt: t.cerradaAt ? t.cerradaAt.toISOString() : null,
      createdAt: t.createdAt.toISOString(),
    })),
  );
});

/**
 * Qué se llevaría el cierre: se consulta ANTES de cerrar para poder
 * mostrarle al usuario exactamente lo que va a pasar, en vez de pedirle que
 * confíe a ciegas en un botón que toca todo el torneo.
 */
router.get("/temporadas/resumen-cierre", requireAuth, requireRole("admin"), async (_req, res): Promise<void> => {
  const conteos = await db.execute<{
    partidos: number; goles: number; tarjetas: number; pagos: number;
    egresos: number; mesas: number; programacion: number; fases: number; jugadores: number;
  }>(sql`
    SELECT
      (SELECT count(*)::int FROM partidos      WHERE temporada IS NULL) AS partidos,
      (SELECT count(*)::int FROM goles         WHERE temporada IS NULL) AS goles,
      (SELECT count(*)::int FROM tarjetas      WHERE temporada IS NULL) AS tarjetas,
      (SELECT count(*)::int FROM pagos         WHERE temporada IS NULL) AS pagos,
      (SELECT count(*)::int FROM egresos       WHERE temporada IS NULL) AS egresos,
      (SELECT count(*)::int FROM mesas         WHERE temporada IS NULL) AS mesas,
      (SELECT count(*)::int FROM programacion  WHERE temporada IS NULL) AS programacion,
      (SELECT count(*)::int FROM fases         WHERE temporada IS NULL) AS fases,
      (SELECT count(DISTINCT pl.jugador_id)::int
         FROM planilla pl JOIN partidos p ON p.id = pl.partido_id
        WHERE p.temporada IS NULL) AS jugadores
  `);
  const c = (conteos.rows ?? conteos)[0] as Record<string, unknown>;

  const [{ sugerido }] = (await db.execute<{ sugerido: string }>(sql`
    SELECT to_char(CURRENT_DATE, 'YYYY') || '-' || to_char(CURRENT_DATE + INTERVAL '1 year', 'YYYY') AS sugerido
  `)).rows as { sugerido: string }[];

  res.json({
    nombreSugerido: sugerido,
    partidos: Number(c.partidos ?? 0),
    goles: Number(c.goles ?? 0),
    tarjetas: Number(c.tarjetas ?? 0),
    pagos: Number(c.pagos ?? 0),
    egresos: Number(c.egresos ?? 0),
    mesas: Number(c.mesas ?? 0),
    programacion: Number(c.programacion ?? 0),
    fases: Number(c.fases ?? 0),
    jugadores: Number(c.jugadores ?? 0),
  });
});

router.post("/temporadas/cerrar", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const nombre = String((req.body ?? {}).nombre ?? "").trim();

  if (!/^\d{4}-\d{4}$/.test(nombre)) {
    res.status(400).json({ error: 'El nombre del torneo debe tener la forma "2026-2027".' });
    return;
  }

  const [yaExiste] = await db.select().from(temporadasTable).where(sql`nombre = ${nombre}`);
  if (yaExiste) {
    res.status(409).json({ error: `Ya existe un torneo llamado "${nombre}".` });
    return;
  }

  const [{ partidos: partidosVivos }] = (await db.execute<{ partidos: number }>(sql`
    SELECT count(*)::int AS partidos FROM partidos WHERE temporada IS NULL
  `)).rows as { partidos: number }[];
  if (Number(partidosVivos) === 0) {
    res.status(409).json({ error: "No hay nada que cerrar: el torneo en curso no tiene partidos." });
    return;
  }

  const resumen = await db.transaction(async (tx) => {
    // 1. La foto de en qué equipo jugó cada jugador este torneo.
    //
    // Solo para los jugadores que estuvieron en UN solo equipo durante el
    // torneo. Los que fueron traspasados a mitad de camino se quedan sin
    // esta fila a propósito: para ellos manda jugador_equipo_historial, que
    // sí sabe la fecha exacta del traspaso y puede atribuir cada partido al
    // equipo correcto. Si les pusiéramos una sola foto, todos sus partidos
    // quedarían con el equipo equivocado — el mismo bug que apareció al
    // importar los Excel viejos.
    const foto = await tx.execute<{ insertados: number }>(sql`
      WITH equipo_por_partido AS (
        SELECT DISTINCT pl.jugador_id, heq.equipo_id
        FROM planilla pl
        JOIN partidos p ON p.id = pl.partido_id AND p.temporada IS NULL
        JOIN jugador_equipo_historial heq
          ON heq.jugador_id = pl.jugador_id
         AND heq.fecha_inicio <= COALESCE(p.fecha, CURRENT_DATE)
         AND (heq.fecha_fin IS NULL OR heq.fecha_fin >= COALESCE(p.fecha, CURRENT_DATE))
      ),
      estables AS (
        SELECT jugador_id, MIN(equipo_id) AS equipo_id
        FROM equipo_por_partido
        GROUP BY jugador_id
        HAVING COUNT(DISTINCT equipo_id) = 1
      )
      INSERT INTO jugador_equipo_temporada (jugador_id, temporada, equipo_id)
      SELECT jugador_id, ${nombre}, equipo_id FROM estables
      ON CONFLICT DO NOTHING
      RETURNING 1
    `);

    // 2. El sello, tabla por tabla.
    const sellados: Record<string, number> = {};
    for (const { nombre: tablaNombre, tabla } of TABLAS_DEL_TORNEO) {
      const filas = await tx
        .update(tabla)
        .set({ temporada: nombre })
        .where(isNull(tabla.temporada))
        .returning({ id: sql<number>`1` });
      sellados[tablaNombre] = filas.length;
    }

    // 3. Los contadores que son de un solo torneo vuelven a cero. La deuda
    //    de inscripción NO se toca: es el precio del año, no un saldo — el
    //    saldo se recalcula solo, porque los pagos ya quedaron sellados.
    await tx.update(equiposTable).set({ puntosBonificacion: 0 });

    // 4. Queda registrado el torneo cerrado.
    await tx.insert(temporadasTable).values({ nombre, cerradaAt: new Date() });

    return { sellados, jugadoresConFoto: (foto.rows ?? foto).length };
  });

  res.status(201).json({
    nombre,
    ...resumen.sellados,
    jugadoresConFoto: resumen.jugadoresConFoto,
  });
});

export default router;
