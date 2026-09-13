import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, usuariosTable } from "@workspace/db";
import { verifyToken, type TokenPayload } from "./auth-token";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/**
 * Lo único que se le permite a quien todavía tiene contraseña temporal:
 * cambiarla, y consultar su propio usuario (que es lo que la aplicación pide
 * al arrancar para saber que tiene que mostrarle esa pantalla).
 */
function esDelCambioDeContrasena(req: Request): boolean {
  const ruta = (req.originalUrl ?? "").split("?")[0];
  return ruta === "/api/auth/password" || ruta === "/api/auth/me";
}

function getToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

/**
 * Exige un token válido y VIGENTE, y lo contrasta contra la base.
 *
 * No alcanza con que la firma cuadre: el rol viaja dentro del token, así que
 * si solo se leyera de ahí, a un usuario borrado le seguiría sirviendo su
 * token y a uno al que le bajaron el rol le quedaría el viejo hasta que
 * volviera a entrar. Por eso el rol que vale es el que dice la base en este
 * momento, no el que traiga el papel.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    try {
      const token = getToken(req);
      const payload = token ? verifyToken(token) : null;
      if (!payload) {
        res.status(401).json({ error: "No autenticado" });
        return;
      }

      const [usuario] = await db
        .select({
          id: usuariosTable.id,
          rol: usuariosTable.rol,
          activo: usuariosTable.activo,
          debeCambiarPassword: usuariosTable.debeCambiarPassword,
        })
        .from(usuariosTable)
        .where(eq(usuariosTable.id, payload.sub));

      if (!usuario || !usuario.activo) {
        res.status(401).json({ error: "Tu sesión ya no es válida. Vuelve a entrar." });
        return;
      }

      // Con una contraseña temporal pendiente no se puede hacer nada más que
      // ponerse una propia (o preguntar quién es uno, que es lo que la
      // aplicación necesita para mostrar esa misma pantalla). Se corta acá y
      // no solo en la interfaz: esconder el formulario no impide que alguien
      // le pegue directo a la API con la contraseña temporal que le pasaron.
      if (usuario.debeCambiarPassword && !esDelCambioDeContrasena(req)) {
        res.status(403).json({
          error: "Tienes una contraseña temporal. Ponte una propia para poder continuar.",
          debeCambiarPassword: true,
        });
        return;
      }

      req.user = { ...payload, rol: usuario.rol };
      next();
    } catch (error) {
      console.error("Error validando la sesión:", error);
      res.status(500).json({ error: "No se pudo validar la sesión" });
    }
  })();
}

/**
 * El Administrador del sistema pasa cualquier control de rol: está por
 * encima del Comité, no al lado. Se resuelve acá, en un solo punto, para no
 * tener que acordarse de sumarlo en cada requireRole("admin") del proyecto.
 */
const ROL_POR_ENCIMA_DE_TODO = "superadmin";

/** Exige, además de estar autenticado, que el rol esté en la lista dada. */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || (req.user.rol !== ROL_POR_ENCIMA_DE_TODO && !roles.includes(req.user.rol))) {
      res.status(403).json({ error: "No tienes permiso para realizar esta acción" });
      return;
    }
    next();
  };
}
