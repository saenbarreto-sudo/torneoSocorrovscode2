import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usuariosTable } from "@workspace/db";
import { verifyPassword } from "../lib/password";
import { signToken, verifyToken } from "../lib/auth-token";

const router: IRouter = Router();

function toPublicUser(u: typeof usuariosTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    nombre: u.nombre,
    rol: u.rol,
    equipoId: u.equipoId,
  };
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const { username, password } = (req.body ?? {}) as { username?: unknown; password?: unknown };

  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    res.status(400).json({ error: "Usuario y contraseña son requeridos" });
    return;
  }

  const [usuario] = await db
    .select()
    .from(usuariosTable)
    .where(eq(usuariosTable.username, username.trim().toLowerCase()));

  if (!usuario || !usuario.activo || !verifyPassword(password, usuario.passwordHash)) {
    res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    return;
  }

  const token = signToken({ sub: usuario.id, username: usuario.username, rol: usuario.rol });
  res.json({ token, user: toPublicUser(usuario) });
});

// Permite a la app validar/restaurar la sesión al recargar la página.
router.get("/auth/me", async (req, res): Promise<void> => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;

  if (!payload) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const [usuario] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, payload.sub));
  if (!usuario || !usuario.activo) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  res.json(toPublicUser(usuario));
});

export default router;
