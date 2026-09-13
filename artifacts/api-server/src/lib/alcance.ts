import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, usuariosTable } from "@workspace/db";
import { requireAuth } from "./require-auth";
import { verifyToken } from "./auth-token";

/**
 * Hasta dónde puede mirar quien está preguntando.
 *
 * Hasta ahora toda lectura (GET) era abierta: con solo tener sesión — o ni
 * eso — se podía pedir la base entera de jugadores con sus cédulas, la
 * deuda de cualquier equipo o la caja del torneo. Esconder el botón en la
 * pantalla no alcanza: el candado tiene que estar acá.
 *
 * Regla del torneo:
 *  - Comité (admin): ve todo.
 *  - Delegado: solo lo de SU equipo.
 *  - Sin cuenta (invitado): solo lo que está en la cartelera — posiciones,
 *    goleadores, valla, calendario y resultados. Nada de personas.
 */
export interface Quien {
  usuarioId: number;
  esAdmin: boolean;
  /**
   * Equipo al que está atado el delegado. null en el comité, que no está
   * atado a ninguno.
   */
  equipoId: number | null;
}

/**
 * El equipo del delegado se lee de la base por el id del usuario, NO del
 * token: si el comité le cambia el equipo a alguien, aplica de inmediato
 * (sin esperar a que caduque su sesión) y un token viejo no puede venir
 * cargando un equipo que ya no le corresponde.
 */
export async function quienPregunta(req: Request): Promise<Quien | null> {
  if (!req.user) return null;
  // El Administrador del sistema ve lo mismo que el Comité (y además la
  // Actividad, que se controla aparte en routes/eventos.ts).
  if (req.user.rol === "admin" || req.user.rol === "superadmin") {
    return { usuarioId: req.user.sub, esAdmin: true, equipoId: null };
  }
  const [usuario] = await db
    .select({ equipoId: usuariosTable.equipoId })
    .from(usuariosTable)
    .where(eq(usuariosTable.id, req.user.sub));
  return { usuarioId: req.user.sub, esAdmin: false, equipoId: usuario?.equipoId ?? null };
}

/**
 * Para rutas que son información interna del comité (la caja, los árbitros,
 * los usuarios): exige sesión Y rol admin, y responde con un mensaje claro
 * en vez de un 403 pelado.
 *
 * Va como un solo middleware y no como un arreglo [requireAuth, ...] porque
 * al pasarle un arreglo a router.get() TypeScript pierde el tipo de req/res
 * del handler y todo queda en "any".
 */
export function soloComite(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.rol !== "admin" && req.user?.rol !== "superadmin") {
      res.status(403).json({ error: "Esta información es solo del Comité Organizador." });
      return;
    }
    next();
  });
}

/**
 * Para rutas que un delegado sí puede consultar, pero únicamente sobre su
 * equipo. Deja `req.quien` listo para que la ruta acote la consulta.
 */
export function requiereSesion(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    void (async () => {
      try {
        const quien = await quienPregunta(req);
        if (!quien) {
          res.status(401).json({ error: "No autenticado" });
          return;
        }
        if (!quien.esAdmin && quien.equipoId == null) {
          res.status(403).json({
            error: "Tu usuario no tiene un equipo asignado. Pídele al Comité Organizador que te lo asigne.",
          });
          return;
        }
        req.quien = quien;
        next();
      } catch (err) {
        next(err);
      }
    })();
  });
}

/**
 * El equipo por el que hay que filtrar: el suyo si es delegado, o el que
 * pidió (o ninguno = todos) si es del comité. Así una misma ruta sirve para
 * los dos sin que el delegado pueda ampliar su alcance cambiando la URL.
 */
export function equipoAConsultar(quien: Quien, equipoIdPedido?: number | null): number | null {
  if (!quien.esAdmin) return quien.equipoId;
  return equipoIdPedido ?? null;
}

/**
 * true (y ya respondió) si el delegado está pidiendo algo de un equipo que
 * no es el suyo. Se responde 404 y no 403 a propósito: un 403 confirmaría
 * que ese registro existe.
 */
export function esDeOtroEquipo(quien: Quien, equipoId: number | null | undefined, res: Response): boolean {
  if (quien.esAdmin) return false;
  if (equipoId != null && equipoId === quien.equipoId) return false;
  res.status(404).json({ error: "No encontrado" });
  return true;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      quien?: Quien;
    }
  }
}

/**
 * Deja pasar a todos, pero marca si quien pregunta tiene sesion.
 *
 * Se usa en las pantallas de la cartelera publica (posiciones, equipos): la
 * pagina tiene que abrir sin cuenta, pero no por eso debe entregar los datos
 * privados de cada equipo. Con esto la ruta decide que campos manda.
 *
 * No rechaza nunca: un token vencido o invento simplemente cuenta como "sin
 * sesion", igual que no mandar nada.
 */
export function sesionOpcional(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  const payload = token ? verifyToken(token) : null;
  if (payload) req.user = payload;
  next();
}
