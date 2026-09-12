import type { NextFunction, Request, Response } from "express";
import { verifyToken, type TokenPayload } from "./auth-token";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

function getToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

/** Exige un token válido; adjunta el usuario decodificado a req.user. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  req.user = payload;
  next();
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
