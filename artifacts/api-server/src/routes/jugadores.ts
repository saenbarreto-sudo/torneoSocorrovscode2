import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, jugadoresTable, equiposTable } from "@workspace/db";
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
} from "@workspace/api-zod";

const router: IRouter = Router();

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
function validarJugador(
  data: { cedula?: string; fechaNacimiento?: string; nombre?: string },
  esCreacion: boolean,
): string | null {
  if (esCreacion || data.cedula !== undefined) {
    if (!data.cedula || !data.cedula.trim()) {
      return "La cédula es obligatoria";
    }
  }
  if (data.fechaNacimiento) {
    const edad = edadEnElAno(data.fechaNacimiento);
    if (edad < EDAD_MINIMA) {
      return `El jugador cumple ${edad} años este año. El reglamento exige mínimo ${EDAD_MINIMA} (Art. 10.1).`;
    }
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
    .orderBy(jugadoresTable.nombre);

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
  const [equipo] = await db.select().from(equiposTable).where(eq(equiposTable.id, inserted.equipoId));
  res.status(201).json(CreateJugadorResponse.parse({ ...inserted, equipoNombre: equipo?.nombre ?? "", createdAt: inserted.createdAt.toISOString() }));
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
  res.json(GetJugadorResponse.parse({ ...row, createdAt: row.createdAt.toISOString() }));
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
  const [updated] = await db.update(jugadoresTable).set(parsed.data).where(eq(jugadoresTable.id, params.data.id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Jugador not found" });
    return;
  }
  const [equipo] = await db.select().from(equiposTable).where(eq(equiposTable.id, updated.equipoId));
  res.json(UpdateJugadorResponse.parse({ ...updated, equipoNombre: equipo?.nombre ?? "", createdAt: updated.createdAt.toISOString() }));
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

export default router;
