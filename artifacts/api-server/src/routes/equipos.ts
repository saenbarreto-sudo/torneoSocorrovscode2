import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, equiposTable } from "@workspace/db";
import { requireAuth, writeAccess } from "../lib/permissions";
import { sesionOpcional } from "../lib/alcance";
import { respondIfDeleteBlocked } from "../lib/delete-errors";
import {
  CreateEquipoBody,
  CreateEquipoResponse,
  GetEquipoParams,
  GetEquipoResponse,
  GetEquiposResponse,
  UpdateEquipoBody,
  UpdateEquipoParams,
  UpdateEquipoResponse,
  DeleteEquipoParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

/**
 * Reglas de negocio de equipos:
 * - El nombre no se puede repetir (evita los duplicados por mayúsculas que
 *   había en el Excel: "Los amigos" vs "Los Amigos").
 * - El teléfono es obligatorio: es el contacto del delegado.
 */
const TELEFONO_VALIDO = /^[\d\s()+-]+$/;

function validarEquipo(data: { nombre?: string; telefono?: string }, esCreacion: boolean): string | null {
  if (esCreacion || data.telefono !== undefined) {
    if (!data.telefono || !data.telefono.trim()) {
      return "El teléfono es obligatorio";
    }
  }
  if (data.telefono !== undefined && data.telefono.trim() && !TELEFONO_VALIDO.test(data.telefono.trim())) {
    return "El teléfono solo puede tener números y los símbolos + - ( )";
  }
  return null;
}

async function nombreEquipoRepetido(nombre: string, excluirId?: number): Promise<boolean> {
  const normalizado = nombre.trim().toLowerCase();
  const encontrados = await db
    .select({ id: equiposTable.id })
    .from(equiposTable)
    .where(sql`lower(trim(nombre)) = ${normalizado}`);
  return encontrados.some((e) => e.id !== excluirId);
}


/**
 * La ficha del equipo tal como puede verla quien NO tiene sesion.
 *
 * El nombre, el color y los puntos de bonificacion son de la cartelera: la
 * tabla de posiciones y el cuadro final los necesitan sin cuenta. El
 * delegado, su suplente, el telefono y la deuda de inscripcion no: son datos
 * personales de gente del torneo y plata del equipo, y no tienen por que
 * quedar al alcance de cualquiera que abra la direccion de la API.
 */
function equipoParaElPublico(e: typeof equiposTable.$inferSelect) {
  return {
    id: e.id,
    nombre: e.nombre,
    color: e.color,
    activo: e.activo,
    puntosBonificacion: e.puntosBonificacion,
    createdAt: e.createdAt.toISOString(),
  };
}

function equipoCompleto(e: typeof equiposTable.$inferSelect) {
  return { ...e, createdAt: e.createdAt.toISOString() };
}

router.get("/equipos", sesionOpcional, async (req, res): Promise<void> => {
  const equipos = await db.select().from(equiposTable).orderBy(equiposTable.nombre);
  const mapear = req.user ? equipoCompleto : equipoParaElPublico;
  res.json(GetEquiposResponse.parse(equipos.map(mapear)));
});

router.post("/equipos", requireAuth, writeAccess.equipos, async (req, res): Promise<void> => {
  const parsed = CreateEquipoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const errorValidacion = validarEquipo(parsed.data, true);
  if (errorValidacion) {
    res.status(400).json({ error: errorValidacion });
    return;
  }
  if (await nombreEquipoRepetido(parsed.data.nombre)) {
    res.status(409).json({ error: `Ya existe un equipo llamado "${parsed.data.nombre.trim()}"` });
    return;
  }
  const [equipo] = await db.insert(equiposTable).values(parsed.data).returning();
  res.status(201).json(CreateEquipoResponse.parse({ ...equipo, createdAt: equipo.createdAt.toISOString() }));
});

router.get("/equipos/:id", sesionOpcional, async (req, res): Promise<void> => {
  const params = GetEquipoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [equipo] = await db.select().from(equiposTable).where(eq(equiposTable.id, params.data.id));
  if (!equipo) {
    res.status(404).json({ error: "Equipo not found" });
    return;
  }
  res.json(GetEquipoResponse.parse(req.user ? equipoCompleto(equipo) : equipoParaElPublico(equipo)));
});

router.patch("/equipos/:id", requireAuth, writeAccess.equipos, async (req, res): Promise<void> => {
  const params = UpdateEquipoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateEquipoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const errorValidacion = validarEquipo(parsed.data, false);
  if (errorValidacion) {
    res.status(400).json({ error: errorValidacion });
    return;
  }
  if (parsed.data.nombre && (await nombreEquipoRepetido(parsed.data.nombre, params.data.id))) {
    res.status(409).json({ error: `Ya existe otro equipo llamado "${parsed.data.nombre.trim()}"` });
    return;
  }
  const [equipo] = await db.update(equiposTable).set(parsed.data).where(eq(equiposTable.id, params.data.id)).returning();
  if (!equipo) {
    res.status(404).json({ error: "Equipo not found" });
    return;
  }
  res.json(UpdateEquipoResponse.parse({ ...equipo, createdAt: equipo.createdAt.toISOString() }));
});

router.delete("/equipos/:id", requireAuth, writeAccess.equipos, async (req, res): Promise<void> => {
  const params = DeleteEquipoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const [equipo] = await db.delete(equiposTable).where(eq(equiposTable.id, params.data.id)).returning();
    if (!equipo) {
      res.status(404).json({ error: "Equipo not found" });
      return;
    }
    res.sendStatus(204);
  } catch (err) {
    if (respondIfDeleteBlocked(err, res, "este equipo")) return;
    throw err;
  }
});

export default router;
