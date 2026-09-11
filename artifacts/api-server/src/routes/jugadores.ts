import { Router, type IRouter } from "express";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { db, jugadoresTable, equiposTable, jugadorEquipoHistorialTable } from "@workspace/db";
import { requireAuth, writeAccess } from "../lib/permissions";
import { respondIfDeleteBlocked } from "../lib/delete-errors";
import { requiereSesion, equipoAConsultar, esDeOtroEquipo } from "../lib/alcance";
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

router.get("/jugadores", requiereSesion, async (req, res): Promise<void> => {
  const query = GetJugadoresQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  // Un delegado solo ve su plantilla: el equipo sale de su usuario, no de
  // la URL, así que cambiar el ?equipoId= no lo saca de su equipo.
  const equipoId = equipoAConsultar(req.quien!, query.data.equipoId);

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
      // Se une con partidos y se filtra por temporada IS NULL (torneo
      // actual) para que un historial importado no lo marque como activo.
      partidosJugados: sql<number>`(
        SELECT COUNT(*)::int FROM planilla pl
        JOIN partidos p ON p.id = pl.partido_id
        WHERE pl.jugador_id = ${jugadoresTable.id} AND p.temporada IS NULL
      )`,
      createdAt: jugadoresTable.createdAt,
    })
    .from(jugadoresTable)
    .innerJoin(equiposTable, eq(jugadoresTable.equipoId, equiposTable.id))
    .where(equipoId != null ? eq(jugadoresTable.equipoId, equipoId) : undefined)
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

router.get("/jugadores/:id", requiereSesion, async (req, res): Promise<void> => {
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
  // La ficha lleva cédula, foto, fecha de nacimiento y carnetización: un
  // delegado solo puede abrir la de los jugadores de su propio equipo.
  if (esDeOtroEquipo(req.quien!, row.equipoId, res)) return;
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

router.get("/jugadores/:id/historial", requiereSesion, async (req, res): Promise<void> => {
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
  if (esDeOtroEquipo(req.quien!, jugador.equipoId, res)) return;

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
  // stint más reciente de cada uno (para el equipo/fechas del torneo
  // actual); las estadísticas de abajo se desglosan además por temporada.
  const stintPorEquipo = new Map<number, (typeof stints)[number]>();
  for (const s of stints) {
    if (!stintPorEquipo.has(s.equipoId)) stintPorEquipo.set(s.equipoId, s);
  }

  // Partidos jugados, goles y tarjetas, atribuidos al equipo Y a la
  // temporada de ese partido/gol/tarjeta (NULL = torneo actual, ver
  // schema/partidos.ts). El equipo se resuelve así:
  //  - Si hay foto de la temporada (jugador_equipo_temporada), manda esa:
  //    es un mapeo directo (jugador, temporada) → equipo, sin fechas de por
  //    medio. Hace falta porque las fechas reales de una temporada y la
  //    siguiente a veces se traslapan en los Excel de origen (ej. la
  //    2022-2023 sigue hasta julio 2023 mientras la 2023-2024 ya arrancó en
  //    febrero), y ahí un rango de fechas atribuía mal.
  //  - Si no hay foto, se resuelve por rango de fecha con
  //    jugador_equipo_historial. Ese es el caso del torneo en curso y
  //    TAMBIÉN el de un jugador traspasado a mitad de un torneo ya cerrado:
  //    al cerrar se le deja a propósito sin foto (ver routes/temporadas.ts),
  //    justamente para que cada partido caiga en el equipo que le
  //    corresponde por fecha en vez de todos en el último.
  const partidosPorEquipoTemporada = await db.execute<{ equipoId: number; equipoNombre: string; temporada: string | null; total: number; fechaMin: string | null; fechaMax: string | null }>(sql`
    SELECT
      COALESCE(jet.equipo_id, heq.equipo_id) AS "equipoId",
      e.nombre AS "equipoNombre",
      p.temporada,
      COUNT(*)::int AS total,
      MIN(p.fecha)::text AS "fechaMin",
      MAX(p.fecha)::text AS "fechaMax"
    FROM planilla pl
    JOIN partidos p ON p.id = pl.partido_id
    LEFT JOIN jugador_equipo_temporada jet ON jet.jugador_id = pl.jugador_id AND jet.temporada = p.temporada
    LEFT JOIN jugador_equipo_historial heq
      ON heq.jugador_id = pl.jugador_id
     AND heq.fecha_inicio <= COALESCE(p.fecha, CURRENT_DATE)
     AND (heq.fecha_fin IS NULL OR heq.fecha_fin >= COALESCE(p.fecha, CURRENT_DATE))
    JOIN equipos e ON e.id = COALESCE(jet.equipo_id, heq.equipo_id)
    WHERE pl.jugador_id = ${jugadorId}
    GROUP BY COALESCE(jet.equipo_id, heq.equipo_id), e.nombre, p.temporada
  `);

  const golesPorEquipoTemporada = await db.execute<{ equipoId: number; temporada: string | null; total: number }>(sql`
    SELECT COALESCE(jet.equipo_id, heq.equipo_id) AS "equipoId", g.temporada, COALESCE(SUM(g.cantidad), 0)::int AS total
    FROM goles g
    LEFT JOIN partidos p ON p.id = g.partido_id
    LEFT JOIN jugador_equipo_temporada jet ON jet.jugador_id = g.jugador_id AND jet.temporada = g.temporada
    LEFT JOIN jugador_equipo_historial heq
      ON heq.jugador_id = g.jugador_id
     AND heq.fecha_inicio <= COALESCE(p.fecha, g.fecha, CURRENT_DATE)
     AND (heq.fecha_fin IS NULL OR heq.fecha_fin >= COALESCE(p.fecha, g.fecha, CURRENT_DATE))
    WHERE g.jugador_id = ${jugadorId} AND g.propio = false AND COALESCE(jet.equipo_id, heq.equipo_id) IS NOT NULL
    GROUP BY COALESCE(jet.equipo_id, heq.equipo_id), g.temporada
  `);

  const tarjetasPorEquipoTemporada = await db.execute<{ equipoId: number; temporada: string | null; tipo: string; total: number }>(sql`
    SELECT COALESCE(jet.equipo_id, heq.equipo_id) AS "equipoId", t.temporada, t.tipo, COUNT(*)::int AS total
    FROM tarjetas t
    LEFT JOIN partidos p ON p.id = t.partido_id
    LEFT JOIN jugador_equipo_temporada jet ON jet.jugador_id = t.jugador_id AND jet.temporada = t.temporada
    LEFT JOIN jugador_equipo_historial heq
      ON heq.jugador_id = t.jugador_id
     AND heq.fecha_inicio <= COALESCE(p.fecha, t.fecha, CURRENT_DATE)
     AND (heq.fecha_fin IS NULL OR heq.fecha_fin >= COALESCE(p.fecha, t.fecha, CURRENT_DATE))
    WHERE t.jugador_id = ${jugadorId} AND COALESCE(jet.equipo_id, heq.equipo_id) IS NOT NULL
    GROUP BY COALESCE(jet.equipo_id, heq.equipo_id), t.temporada, t.tipo
  `);

  const clave = (equipoId: number, temporada: string | null) => `${equipoId}|${temporada ?? ""}`;

  const claves = new Set<string>();
  const nombrePorClave = new Map<string, string>();
  const fechasPorClave = new Map<string, { fechaInicio: string; fechaFin: string | null }>();
  // El stint vigente (sin fecha_fin) siempre aparece con temporada actual
  // (NULL), aunque todavía no tenga partidos/goles/tarjetas — para que un
  // jugador recién llegado a un equipo ya se vea ahí con 0/0/0/0.
  for (const s of stints) {
    if (s.fechaFin === null) {
      const k = clave(s.equipoId, null);
      claves.add(k);
      nombrePorClave.set(k, s.equipoNombre);
      fechasPorClave.set(k, { fechaInicio: s.fechaInicio, fechaFin: s.fechaFin });
    }
  }

  const partidosMap = new Map<string, number>();
  for (const r of partidosPorEquipoTemporada.rows) {
    const k = clave(r.equipoId, r.temporada);
    claves.add(k);
    partidosMap.set(k, r.total);
    nombrePorClave.set(k, r.equipoNombre);
    if (r.fechaMin) fechasPorClave.set(k, { fechaInicio: r.fechaMin, fechaFin: r.temporada ? r.fechaMax : null });
  }
  const golesMap = new Map<string, number>();
  for (const r of golesPorEquipoTemporada.rows) {
    const k = clave(r.equipoId, r.temporada);
    claves.add(k);
    golesMap.set(k, r.total);
  }
  const amarillasMap = new Map<string, number>();
  const rojasMap = new Map<string, number>();
  for (const r of tarjetasPorEquipoTemporada.rows) {
    const k = clave(r.equipoId, r.temporada);
    claves.add(k);
    (r.tipo === "amarilla" ? amarillasMap : r.tipo === "roja" ? rojasMap : null)?.set(k, r.total);
  }

  const historial = [...claves]
    .map((k) => {
      const [equipoIdTexto, temporadaTexto] = k.split("|");
      const equipoId = Number(equipoIdTexto);
      const temporada = temporadaTexto === "" ? null : temporadaTexto;
      const fechas = fechasPorClave.get(k);
      return {
        equipoId,
        equipoNombre: nombrePorClave.get(k) ?? stintPorEquipo.get(equipoId)?.equipoNombre ?? "",
        temporada,
        fechaInicio: fechas?.fechaInicio ?? HISTORIAL_SENTINEL_FECHA,
        fechaFin: fechas?.fechaFin ?? null,
        partidosJugados: partidosMap.get(k) ?? 0,
        goles: golesMap.get(k) ?? 0,
        amarillas: amarillasMap.get(k) ?? 0,
        rojas: rojasMap.get(k) ?? 0,
      };
    })
    // Más reciente primero: la temporada actual (NULL) va de primera, y
    // luego las temporadas pasadas de más nueva a más vieja por texto
    // ("2025-2026" > "2021-2022").
    .sort((a, b) => {
      if (a.temporada === b.temporada) return a.equipoNombre.localeCompare(b.equipoNombre);
      if (a.temporada === null) return -1;
      if (b.temporada === null) return 1;
      return b.temporada.localeCompare(a.temporada);
    });

  res.json(GetJugadorHistorialResponse.parse(historial));
});

export default router;
