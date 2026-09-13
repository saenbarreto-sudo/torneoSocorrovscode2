import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Tokens de sesión firmados con HMAC-SHA256 (formato similar a un JWT, pero
 * sin necesitar instalar la librería "jsonwebtoken"). El servidor firma el
 * payload con un secreto; el cliente solo puede usarlo, no falsificarlo.
 *
 * IMPORTANTE: define AUTH_SECRET en tu .env con un valor propio antes de
 * usar esto en producción. Si no lo defines, se usa un valor por defecto
 * solo apto para desarrollo local.
 */

const SECRET_POR_DEFECTO = "torneo-socorro-dev-secret-cambia-esto-en-produccion";
const SECRET = process.env.AUTH_SECRET ?? SECRET_POR_DEFECTO;

/**
 * Cuanto dura una sesion. Doce horas cubre de sobra un dia de juego completo
 * (la mesa abre en la manana y cierra en la tarde) sin dejar un token vivo
 * para siempre: si alguien se copia el token de un computador prestado, deja
 * de servir esa misma noche.
 */
const DURACION_MS = 12 * 60 * 60 * 1000;

/**
 * Avisa fuerte si el torneo se publica con el secreto de ejemplo. Con ese
 * valor cualquiera que lo conozca puede fabricarse un token de
 * Administrador del sistema sin saber ninguna contrasena.
 */
export function avisarSiElSecretoEsDePrueba(): void {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET === SECRET_POR_DEFECTO) {
    console.warn(
      [
        "",
        "  AUTH_SECRET no esta configurado (o quedo con el valor de ejemplo).",
        "  Sirve para desarrollo local, pero NO para publicar: con un secreto",
        "  conocido cualquiera puede firmarse un token de administrador.",
        "  Pon un texto largo y aleatorio en AUTH_SECRET dentro de .env.",
        "",
      ].join(String.fromCharCode(10)),
    );
  }
}

export interface TokenPayload {
  sub: number; // id del usuario
  username: string;
  rol: string;
  /** Cuando se emitio, en milisegundos. */
  iat: number;
  /** Hasta cuando sirve, en milisegundos. Despues de esto no se acepta. */
  exp: number;
}

function base64url(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64url");
}

export function signToken(payload: Omit<TokenPayload, "iat" | "exp">): string {
  const ahora = Date.now();
  const full: TokenPayload = { ...payload, iat: ahora, exp: ahora + DURACION_MS };
  const body = base64url(JSON.stringify(full));
  const signature = createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = createHmac("sha256", SECRET).update(body).digest("base64url");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as TokenPayload;
  } catch {
    return null;
  }

  // La firma puede estar perfecta y el token estar vencido igual. Los tokens
  // emitidos antes de que existiera "exp" no traen fecha de vencimiento: se
  // rechazan, que es lo mismo que pedir que vuelvan a entrar una vez.
  if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;

  return payload;
}
