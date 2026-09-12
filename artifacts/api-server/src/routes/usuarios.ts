import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usuariosTable, ROLES_USUARIO } from "@workspace/db";
import { hashPassword } from "../lib/password";
import { requireAuth, requireRole } from "../lib/require-auth";
import { soloComite } from "../lib/alcance";

const router: IRouter = Router();

function toPublic(u: typeof usuariosTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    nombre: u.nombre,
    rol: u.rol,
    equipoId: u.equipoId,
    activo: u.activo,
    createdAt: u.createdAt.toISOString(),
  };
}

// Todas las rutas de este archivo requieren estar autenticado como
// Comité Organizador (admin). Solo esa cuenta puede crear/editar usuarios.
router.use("/usuarios", requireAuth, requireRole("admin"));

const ROL_SISTEMA = "superadmin";

/**
 * El rol de Administrador del sistema solo lo reparte quien ya lo tiene, y
 * su cuenta solo la toca él mismo.
 *
 * Sin esto el control no serviría: cualquiera del Comité podría ponerse el
 * rol (y así ver la Actividad, que es el registro de lo que hace el Comité)
 * o cambiarle la contraseña al Administrador para entrar como él.
 *
 * Devuelve true (y ya respondió) si hay que frenar la operación.
 */
function bloqueaTocarElSistema(
  req: { user?: { rol: string } },
  res: { status: (c: number) => { json: (b: unknown) => void } },
  opciones: { rolPedido?: unknown; rolActualDelUsuario?: string },
): boolean {
  if (req.user?.rol === ROL_SISTEMA) return false;
  const tocaElRol = opciones.rolPedido === ROL_SISTEMA || opciones.rolActualDelUsuario === ROL_SISTEMA;
  if (!tocaElRol) return false;
  res.status(403).json({
    error: "Solo el Administrador del sistema puede asignar ese rol o modificar esa cuenta.",
  });
  return true;
}

router.get("/usuarios", soloComite, async (_req, res): Promise<void> => {
  const usuarios = await db.select().from(usuariosTable).orderBy(usuariosTable.nombre);
  res.json(usuarios.map(toPublic));
});

router.post("/usuarios", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const { username, password, nombre, rol, equipoId, activo } = body;

  if (!username || !password || !nombre || !rol) {
    res.status(400).json({ error: "username, password, nombre y rol son requeridos" });
    return;
  }
  if (!ROLES_USUARIO.includes(rol as (typeof ROLES_USUARIO)[number])) {
    res.status(400).json({ error: "Rol inválido" });
    return;
  }
  if (bloqueaTocarElSistema(req, res, { rolPedido: rol })) return;
  if (String(password).length < 4) {
    res.status(400).json({ error: "La contraseña debe tener al menos 4 caracteres" });
    return;
  }

  const normalizedUsername = String(username).trim().toLowerCase();
  const [existing] = await db.select().from(usuariosTable).where(eq(usuariosTable.username, normalizedUsername));
  if (existing) {
    res.status(409).json({ error: "Ya existe un usuario con ese nombre de usuario" });
    return;
  }

  const [usuario] = await db
    .insert(usuariosTable)
    .values({
      username: normalizedUsername,
      passwordHash: hashPassword(String(password)),
      nombre: String(nombre).trim(),
      rol: rol as string,
      equipoId: typeof equipoId === "number" ? equipoId : null,
      activo: activo === undefined ? true : Boolean(activo),
    })
    .returning();

  res.status(201).json(toPublic(usuario));
});

router.patch("/usuarios/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }

  const [actual] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, id));
  if (!actual) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const { username, password, nombre, rol, equipoId, activo } = body;
  if (bloqueaTocarElSistema(req, res, { rolPedido: rol, rolActualDelUsuario: actual.rol })) return;
  const updates: Record<string, unknown> = {};

  if (username !== undefined) updates.username = String(username).trim().toLowerCase();
  if (nombre !== undefined) updates.nombre = String(nombre).trim();
  if (rol !== undefined) {
    if (!ROLES_USUARIO.includes(rol as (typeof ROLES_USUARIO)[number])) {
      res.status(400).json({ error: "Rol inválido" });
      return;
    }
    updates.rol = rol;
  }
  if (equipoId !== undefined) updates.equipoId = equipoId;
  if (activo !== undefined) updates.activo = Boolean(activo);
  if (password) {
    if (String(password).length < 4) {
      res.status(400).json({ error: "La contraseña debe tener al menos 4 caracteres" });
      return;
    }
    updates.passwordHash = hashPassword(String(password));
  }

  const [usuario] = await db.update(usuariosTable).set(updates).where(eq(usuariosTable.id, id)).returning();
  if (!usuario) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  res.json(toPublic(usuario));
});

router.delete("/usuarios/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const [actual] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, id));
  if (!actual) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  if (bloqueaTocarElSistema(req, res, { rolActualDelUsuario: actual.rol })) return;

  const [usuario] = await db.delete(usuariosTable).where(eq(usuariosTable.id, id)).returning();
  if (!usuario) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  res.sendStatus(204);
});

export default router;
