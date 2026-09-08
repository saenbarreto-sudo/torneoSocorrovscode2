import { Router, type IRouter } from "express";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { db, jugadoresTable, equiposTable, jugadorEquipoHistorialTable } from "@workspace/db";
import { requireAuth, writeAccess } from "../lib/permissions";
import { respondIfDeleteBlocked } from "../lib/delete-errors";
import {
  CreateJugadorBody,
  CreateJugadorResponse,
  GetJugadorParams,
  GetJugadorResponse,
  GetJugadoresResponse,
  GetJugadoresQueryParams,
  UpdateJugadorBody,
  UpdateJugadorParams,
  UpdateJugadorResponse,
  DeleteJugadorParams,
  GetJugadorHistorialParams,
  GetJugadorHistorialResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Fecha "desde siempre" usada para rellenar el primer registro de historial
// de un jugador que ya existía antes de esta funcionalidad, de forma que
// sus goles/tarjetas/partidos previos no queden sin equipo atribuido.
const HISTORIAL_SENTINEL_FECHA = "2000-01-01";

/**
 * Mantiene jugador_equipo_historial sincronizada con jugadores.equipo_id.
 * Si el jugador todavía no tiene un stint abierto (porque es anterior a
 * esta funcionalidad), primero rellena uno cerrado con su equipo anterior
 * para no perder la atribución histórica, y luego abre el nuevo.
 */
async function sincronizarHistorialEquipo(jugadorId: number, equipoIdAnterior: number, nuevoEquipoId: number): Promise<void> {
  if (equipoIdAnterior === nuevoEquipoId) return;
  const hoy = hoyISO();
  const [abierto] = await db
    .select({ id: jugadorEquipoHistorialTable.id })
    .from(jugadorEquipoHistorialTable)
    .where(and(eq(jugadorEquipoHistorialTable.jugadorId, jugadorId), isNull(jugadorEquipoHistorialTable.fechaFin)));

  if (abierto) {
    await db.update(jugadorEquipoHistorialTable).set({ fechaFin: hoy }).where(eq(jugadorEquipoHistorialTable.id, abierto.id));
  } else {
    await db.insert(jugadorEquipoHistorialTable).values({
      jugadorId,
      equipoId: equipoIdAnterior,
      fechaInicio: HISTORIAL_SENTINEL_FECHA,
      fechaFin: hoy,
    });
  }
  await db.insert(jugadorEquipoHistorialTable).values({ jugadorId, equipoId: nuevoEquipoId, fechaInicio: hoy, fechaFin: null });
}

/** "Último equipo donde jugó": el equipo del stint cerrado más reciente. */
async function obtenerUltimoEquipo(
  jugadorId: number,
): Promise<{ ultimoEquipoId: number | null; ultimoEquipoNombre: string | null; ultimoEquipoFechaFin: string | null }> {
  const [ultimo] = await db
    .select({
      equipoId: jugadorEquipoHistorialTable.equipoId,
      equipoNombre: equiposTable.nombre,
      fechaFin: jugadorEquipoHistorialTable.fechaFin,
    })
    .from(jugadorEquipoHistorialTable)
    .innerJoin(equiposTable, eq(jugadorEquipoHistorialTable.equipoId, equiposTable.id))
    .where(and(eq(jugadorEquipoHistorialTable.jugadorId, jugadorId), sql`${jugadorEquipoHistorialTable.fechaFin} IS NOT NULL`))
    .orderBy(desc(jugadorEquipoHistorialTable.fechaFin))
    .limit(1);
  return {
    ultimoEquipoId: ultimo?.equipoId ?? null,
    ultimoEquipoNombre: ultimo?.equipoNombre ?? null,
    ultimoEquipoFechaFin: ultimo?.fechaFin ?? null,
  };
}


/**
 * Edad que cumple el jugador dentro del año del torneo (Art. 10.1).
 * El reglamento se fija en el año, no en la fecha exacta: si el jugador
 * cumple 40 en diciembre y el torneo arranca en enero de ese mismo año,
 * igual puede jugar. Por eso se compara solo por año calendario.
 */
export function edadEnElAno(fechaNacimiento: string, anoReferencia = new Date().getFullYear()): number {
  return anoReferencia - new Date(fechaNacimiento).getFullYear();
}

const EDAD_MINIMA = 40;

async function cedulaRepetida(cedula: string, excluirId?: number): Promise<boolean> {
  const normalizada = cedula.trim();
  const encontrados = await db
    .select({ id: jugadoresTable.id })
    .from(jugadoresTable)
    .where(sql`trim(cedula) = ${normalizada}`);
  return encontrados.some((j) => j.id !== excluirId);
}

/** Valida cédula obligatoria y edad mínima. Devuelve el mensaje de error o null. */
/**
 * El esquema de zod generado del openapi.yaml solo revisa que los campos
 * tengan el tipo correcto (string, number...), no su formato — por eso las
 * reglas de negocio (cédula sin letras, carné positivo...) van aparte acá.
 * Esta es la única validación real: la del frontend es solo para avisar
 * antes de enviar, pero cualquiera que le pegue directo a la API se
 * saltaría eso, así que esto es lo que de verdad protege los datos.
 */
function validarJugador(
  data: { cedula?: string; fechaNacimiento?: string; nombre?: string; nCarnet?: number; carnetValor?: number | null },
  esCreacion: boolean,
): string | null {
  if (esCreacion || data.cedula !== undefined) {
    if (!data.cedula || !data.cedula.trim()) {
      return "La cédula es obligatoria";
    }
  }
  if (data.cedula !== undefined && data.cedula.trim() && !/^\d+$/.test(data.cedula.trim())) {
    return "La cédula debe contener solo números, sin puntos ni espacios";
  }
  if (data.fechaNacimiento) {
    const edad = edadEnElAno(data.fechaNacimiento);
    if (edad < EDAD_MINIMA) {
      return `El jugador cumple ${edad} años este año. El reglamento exige mínimo ${EDAD_MINIMA} (Art. 10.1).`;
    }
  }
  if (data.nCarnet !== undefined && (!Number.isInteger(data.nCarnet) || data.nCarnet <= 0)) {
    return "El número de carné debe ser un número entero mayor a 0";
  }
  if (data.carnetValor != null && (!Number.isInteger(data.carnetValor) || data.carnetValor < 0)) {
    return "El valor del carné debe ser un número entero, sin decimales ni negativos";
  }
  return null;
}


function formatJugador(j: typeof jugadoresTable.$inferSelect & { equipoNombre: string }) {
  return {
    ...j,
    createdAt: j.createdAt.toISOString(),
  };
}

router.get("/jugadores", async (req, res): Promise<void> => {
  const query = GetJugadoresQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const rows = await db
    .select({
      id: jugadoresTable.id,
      cedula: jugadoresTable.cedula,
      nombre: jugadoresTable.nombre,
      fechaNacimiento: jugadoresTable.fechaNacimiento,
      equipoId: jugadoresTable.equipoId,
      equipoNombre: equiposTable.nombre,
      nCarnet: jugadoresTable.nCarnet,
      activo: jugadoresTable.activo,
      // Partidos jugados según la planilla: es lo que determina si el
      // jugador está activo en el torneo (al menos 1 partido disputado).
      partidosJugados: sql<number>`(
        SELECT COUNT(*)::int FROM planilla pl WHERE pl.jugador_id = ${jugadoresTable.id}
      )`,
      createdAt: jugadoresTable.createdAt,
    })
    .from(jugadoresTable)
    .innerJoin(equiposTable, eq(jugadoresTable.equipoId, equiposTable.id))
    .where(query.data.equipoId != null ? eq(jugadoresTable.equipoId, query.data.equipoId) : undefined)
    // Por número de carné, que es el orden en el que se lleva la base del
    // torneo. Los que todavía no tienen carné van al final, y entre iguales
    // se desempata por nombre.
    .orderBy(sql`${jugadoresTable.nCarnet} ASC NULLS LAST`, jugadoresTable.nombre);

  res.json(GetJugadoresResponse.parse(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() }))));
});

router.post("/jugadores", requireAuth, writeAccess.jugadores, async (req, res): Promise<void> => {
  const parsed = CreateJugadorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const errorValidacion = validarJugador(parsed.data, true);
  if (errorValidacion) {
    res.status(400).json({ error: errorValidacion });
    return;
  }
  if (await cedulaRepetida(parsed.data.cedula!)) {
    res.status(409).json({ error: `Ya hay un jugador registrado con la cédula ${parsed.data.cedula!.trim()}` });
    return;
  }
  const [inserted] = await db.insert(jugadoresTable).values(parsed.data).returning();
  await db.insert(jugadorEquipoHistorialTable).values({
    jugadorId: inserted.id,
    equipoId: inserted.equipoId,
    fechaInicio: hoyISO(),
    fechaFin: null,
  });
  const [equipo] = await db.select().from(equiposTable).where(eq(equiposTable.id, inserted.equipoId));
  res.status(201).json(CreateJugadorResponse.parse({
    ...inserted,
    equipoNombre: equipo?.nombre ?? "",
    ultimoEquipoId: null,
    ultimoEquipoNombre: null,
    ultimoEquipoFechaFin: null,
    createdAt: inserted.createdAt.toISOString(),
  }));
});

router.get("/jugadores/:id", async (req, res): Promise<void> => {
  const params = GetJugadorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select({
      id: jugadoresTable.id,
      cedula: jugadoresTable.cedula,
      nombre: jugadoresTable.nombre,
      fechaNacimiento: jugadoresTable.fechaNacimiento,
      equipoId: jugadoresTable.equipoId,
      equipoNombre: equiposTable.nombre,
      nCarnet: jugadoresTable.nCarnet,
      foto: jugadoresTable.foto,
      fechaFoto: jugadoresTable.fechaFoto,
      carnetPagado: jugadoresTable.carnetPagado,
      carnetFechaPago: jugadoresTable.carnetFechaPago,
      carnetValor: jugadoresTable.carnetValor,
      carnetFechaEntrega: jugadoresTable.carnetFechaEntrega,
      carnetQuienRecibio: jugadoresTable.carnetQuienRecibio,
      activo: jugadoresTable.activo,
      createdAt: jugadoresTable.createdAt,
    })
    .from(jugadoresTable)
    .innerJoin(equiposTable, eq(jugadoresTable.equipoId, equiposTable.id))
    .where(eq(jugadoresTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Jugador not found" });
    return;
  }
  const ultimoEquipo = await obtenerUltimoEquipo(row.id);
  res.json(
    GetJugadorResponse.parse({
      ...row,
      ...ultimoEquipo,
      createdAt: row.createdAt.toISOString(),
    }),
  );
});

router.patch("/jugadores/:id", requireAuth, writeAccess.jugadores, async (req, res): Promise<void> => {
  const params = UpdateJugadorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateJugadorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const errorValidacion = validarJugador(parsed.data, false);
  if (errorValidacion) {
    res.status(400).json({ error: errorValidacion });
    return;
  }
  if (parsed.data.cedula && (await cedulaRepetida(parsed.data.cedula, params.data.id))) {
    res.status(409).json({ error: `Ya hay otro jugador registrado con la cédula ${parsed.data.cedula.trim()}` });
    return;
  }
  const [antes] = await db.select({ equipoId: jugadoresTable.equipoId }).from(jugadoresTable).where(eq(jugadoresTable.id, params.data.id));
  if (!antes) {
    res.status(404).json({ error: "Jugador not found" });
    return;
  }
  const [updated] = await db.update(jugadoresTable).set(parsed.data).where(eq(jugadoresTable.id, params.data.id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Jugador not found" });
    return;
  }
  if (parsed.data.equipoId !== undefined) {
    await sincronizarHistorialEquipo(updated.id, antes.equipoId, updated.equipoId);
  }
  const [equipo] = await db.select().from(equiposTable).where(eq(equiposTable.id, updated.equipoId));
  const ultimoEquipo = await obtenerUltimoEquipo(updated.id);
  res.json(UpdateJugadorResponse.parse({ ...updated, equipoNombre: equipo?.nombre ?? "", ...ultimoEquipo, createdAt: updated.createdAt.toISOString() }));
});

router.delete("/jugadores/:id", requireAuth, writeAccess.jugadores, async (req, res): Promise<void> => {
  const params = DeleteJugadorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const [deleted] = await db.delete(jugadoresTable).where(eq(jugadoresTable.id, params.data.id)).returning();
    if (!deleted) {
      res.status(404).json({ error: "Jugador not found" });
      return;
    }
    res.sendStatus(204);
  } catch (err) {
    if (respondIfDeleteBlocked(err, res, "este jugador")) return;
    throw err;
  }
});

router.get("/jugadores/:id/historial", async (req, res): Promise<void> => {
  const params = GetJugadorHistorialParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const jugadorId = params.data.id;

  const [jugador] = await db.select({ equipoId: jugadoresTable.equipoId }).from(jugadoresTable).where(eq(jugadoresTable.id, jugadorId));
  if (!jugador) {
    res.status(404).json({ error: "Jugador not found" });
    return;
  }

  let stints = await db
    .select({
      equipoId: jugadorEquipoHistorialTable.equipoId,
      equipoNombre: equiposTable.nombre,
      fechaInicio: jugadorEquipoHistorialTable.fechaInicio,
      fechaFin: jugadorEquipoHistorialTable.fechaFin,
    })
    .from(jugadorEquipoHistorialTable)
    .innerJoin(equiposTable, eq(jugadorEquipoHistorialTable.equipoId, equiposTable.id))
    .where(eq(jugadorEquipoHistorialTable.jugadorId, jugadorId))
    .orderBy(desc(jugadorEquipoHistorialTable.fechaInicio));

  // Jugador anterior a esta funcionalidad: rellena su único stint (equipo
  // actual, desde siempre) para no perder la atribución de su historial ya
  // jugado.
  if (stints.length === 0) {
    await db.insert(jugadorEquipoHistorialTable).values({
      jugadorId,
      equipoId: jugador.equipoId,
      fechaInicio: HISTORIAL_SENTINEL_FECHA,
      fechaFin: null,
    });
    stints = await db
      .select({
        equipoId: jugadorEquipoHistorialTable.equipoId,
        equipoNombre: equiposTable.nombre,
        fechaInicio: jugadorEquipoHistorialTable.fechaInicio,
        fechaFin: jugadorEquipoHistorialTable.fechaFin,
      })
      .from(jugadorEquipoHistorialTable)
      .innerJoin(equiposTable, eq(jugadorEquipoHistorialTable.equipoId, equiposTable.id))
      .where(eq(jugadorEquipoHistorialTable.jugadorId, jugadorId))
      .orderBy(desc(jugadorEquipoHistorialTable.fechaInicio));
  }

  // Si el jugador pasó dos veces por el mismo equipo, nos quedamos con el
  // stint más reciente de cada uno para no repetir fila (las estadísticas
  // de abajo ya vienen sumadas por equipo, sin importar cuántos stints).
  const porEquipo = new Map<number, (typeof stints)[number]>();
  for (const s of stints) {
    if (!porEquipo.has(s.equipoId)) porEquipo.set(s.equipoId, s);
  }

  // Partidos jugados, goles y tarjetas, atribuidos al equipo que le
  // correspondía al jugador en la fecha de cada partido (según su
  // historial), para que una transferencia no mezcle las estadísticas de
  // los dos equipos.
  const partidosPorEquipo = await db.execute<{ equipoId: number; total: number }>(sql`
    SELECT heq.equipo_id AS "equipoId", COUNT(*)::int AS total
    FROM planilla pl
    JOIN partidos p ON p.id = pl.partido_id
    JOIN jugador_equipo_historial heq
      ON heq.jugador_id = pl.jugador_id
     AND heq.fecha_inicio <= COALESCE(p.fecha, CURRENT_DATE)
     AND (heq.fecha_fin IS NULL OR heq.fecha_fin >= COALESCE(p.fecha, CURRENT_DATE))
    WHERE pl.jugador_id = ${jugadorId}
    GROUP BY heq.equipo_id
  `);

  const golesPorEquipo = await db.execute<{ equipoId: number; total: number }>(sql`
    SELECT heq.equipo_id AS "equipoId", COALESCE(SUM(g.cantidad), 0)::int AS total
    FROM goles g
    LEFT JOIN partidos p ON p.id = g.partido_id
    JOIN jugador_equipo_historial heq
      ON heq.jugador_id = g.jugador_id
     AND heq.fecha_inicio <= COALESCE(p.fecha, g.fecha, CURRENT_DATE)
     AND (heq.fecha_fin IS NULL OR heq.fecha_fin >= COALESCE(p.fecha, g.fecha, CURRENT_DATE))
    WHERE g.jugador_id = ${jugadorId} AND g.propio = false
    GROUP BY heq.equipo_id
  `);

  const tarjetasPorEquipo = await db.execute<{ equipoId: number; tipo: string; total: number }>(sql`
    SELECT heq.equipo_id AS "equipoId", t.tipo, COUNT(*)::int AS total
    FROM tarjetas t
    LEFT JOIN partidos p ON p.id = t.partido_id
    JOIN jugador_equipo_historial heq
      ON heq.jugador_id = t.jugador_id
     AND heq.fecha_inicio <= COALESCE(p.fecha, t.fecha, CURRENT_DATE)
     AND (heq.fecha_fin IS NULL OR heq.fecha_fin >= COALESCE(p.fecha, t.fecha, CURRENT_DATE))
    WHERE t.jugador_id = ${jugadorId}
    GROUP BY heq.equipo_id, t.tipo
  `);

  const partidosMap = new Map(partidosPorEquipo.rows.map((r) => [r.equipoId, r.total]));
  const golesMap = new Map(golesPorEquipo.rows.map((r) => [r.equipoId, r.total]));
  const amarillasMap = new Map<number, number>();
  const rojasMap = new Map<number, number>();
  for (const r of tarjetasPorEquipo.rows) {
    (r.tipo === "amarilla" ? amarillasMap : r.tipo === "roja" ? rojasMap : null)?.set(r.equipoId, r.total);
  }

  const historial = [...porEquipo.values()].map((s) => ({
    equipoId: s.equipoId,
    equipoNombre: s.equipoNombre,
    fechaInicio: s.fechaInicio,
    fechaFin: s.fechaFin,
    partidosJugados: partidosMap.get(s.equipoId) ?? 0,
    goles: golesMap.get(s.equipoId) ?? 0,
    amarillas: amarillasMap.get(s.equipoId) ?? 0,
    rojas: rojasMap.get(s.equipoId) ?? 0,
  }));

  res.json(GetJugadorHistorialResponse.parse(historial));
});

export default router;
