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

const SECRET = process.env.AUTH_SECRET ?? "torneo-socorro-dev-secret-cambia-esto-en-produccion";

export interface TokenPayload {
  sub: number; // id del usuario
  username: string;
  rol: string;
  iat: number;
}

function base64url(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64url");
}

export function signToken(payload: Omit<TokenPayload, "iat">): string {
  const full: TokenPayload = { ...payload, iat: Date.now() };
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

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as TokenPayload;
  } catch {
    return null;
  }
}
