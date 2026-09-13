import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usuariosTable } from "@workspace/db";
import { hashPassword, verifyPassword, motivoContrasenaInvalida } from "../lib/password";
import { signToken, verifyToken } from "../lib/auth-token";
import { requireAuth } from "../lib/require-auth";
import { segundosDePausa, registrarFallo, olvidarFallos, intentosRestantes } from "../lib/limite-intentos";

const router: IRouter = Router();

function toPublicUser(u: typeof usuariosTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    nombre: u.nombre,
    rol: u.rol,
    equipoId: u.equipoId,
    // Si viene en true, la aplicacion le pide ponerse una contrasena propia
    // antes de dejarlo hacer cualquier otra cosa.
    debeCambiarPassword: u.debeCambiarPassword,
  };
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const { username, password } = (req.body ?? {}) as { username?: unknown; password?: unknown };

  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    res.status(400).json({ error: "Usuario y contraseña son requeridos" });
    return;
  }

  // Freno a la adivinanza de contraseñas: ver lib/limite-intentos.ts. Se
  // revisa ANTES de tocar la base, para que ni siquiera valga la pena
  // seguir mandando intentos.
  const pausa = segundosDePausa(username);
  if (pausa !== null) {
    const minutos = Math.ceil(pausa / 60);
    res.status(429).json({
      error:
        `Demasiados intentos fallidos con este usuario. Espera ${minutos === 1 ? "1 minuto" : `${minutos} minutos`} ` +
        "antes de volver a intentar.",
    });
    return;
  }

  const [usuario] = await db
    .select()
    .from(usuariosTable)
    .where(eq(usuariosTable.username, username.trim().toLowerCase()));

  if (!usuario || !usuario.activo || !verifyPassword(password, usuario.passwordHash)) {
    registrarFallo(username);
    const quedan = intentosRestantes(username);
    res.status(401).json({
      // No se dice si falló el usuario o la contraseña: eso le confirmaría a
      // quien busca cuáles usuarios existen.
      error:
        "Usuario o contraseña incorrectos." +
        (quedan > 0 && quedan <= 2 ? ` Te ${quedan === 1 ? "queda 1 intento" : `quedan ${quedan} intentos`}.` : ""),
    });
    return;
  }

  olvidarFallos(username);
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

// Cambio de contraseña por el propio usuario. Pide la contraseña actual
// para confirmar que es quien dice ser. Es la única vía que tiene un
// delegado: la pantalla de Usuarios, donde se reasignan contraseñas ajenas,
// es solo del Comité Organizador.
router.patch("/auth/password", requireAuth, async (req, res): Promise<void> => {
  const { passwordActual, passwordNueva } = (req.body ?? {}) as {
    passwordActual?: unknown;
    passwordNueva?: unknown;
  };

  if (typeof passwordActual !== "string" || typeof passwordNueva !== "string" || !passwordActual || !passwordNueva) {
    res.status(400).json({ error: "La contraseña actual y la nueva son requeridas" });
    return;
  }
  const [usuario] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, req.user!.sub));
  if (!usuario || !usuario.activo) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  if (!verifyPassword(passwordActual, usuario.passwordHash)) {
    res.status(401).json({ error: "La contraseña actual no es correcta" });
    return;
  }
  // La regla se revisa despues de confirmar la contraseña actual, para no
  // darle pistas a quien esta probando cuentas ajenas.
  const motivo = motivoContrasenaInvalida(passwordNueva, usuario.username);
  if (motivo) {
    res.status(400).json({ error: motivo });
    return;
  }
  if (passwordNueva === passwordActual) {
    res.status(400).json({ error: "La contraseña nueva tiene que ser distinta de la actual." });
    return;
  }

  await db
    .update(usuariosTable)
    // Se puso una propia: ya no hay nada temporal pendiente.
    .set({ passwordHash: hashPassword(passwordNueva), debeCambiarPassword: false })
    .where(eq(usuariosTable.id, usuario.id));

  res.json({ ok: true });
});

export default router;
