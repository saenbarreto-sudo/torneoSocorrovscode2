import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Hash + verificación de contraseñas con scrypt (módulo nativo de Node,
 * no requiere instalar bcrypt ni ninguna dependencia adicional).
 * Formato almacenado: "<salt-hex>:<hash-hex>".
 */

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const attempt = scryptSync(password, salt, 64);
  return attempt.length === expected.length && timingSafeEqual(attempt, expected);
}
