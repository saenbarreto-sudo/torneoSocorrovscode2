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

/**
 * Regla de contraseñas del torneo.
 *
 * Ocho caracteres, y nada de exigir mayúsculas, números y símbolos: los
 * usuarios de esto son delegados de un torneo de mayores de 40, no gente de
 * sistemas. Pedirles un símbolo produce "Torneo2026!" escrito en un papel
 * pegado al monitor, que es peor que una frase larga y fácil de recordar.
 * Con el freno de intentos del login (5 fallos y 15 minutos de pausa), ocho
 * caracteres ya no se adivinan ni en años.
 *
 * Lo que sí se rechaza es lo que la gente pone por defecto: solo números
 * (de ahí venía el "2026"), el propio nombre de usuario, y un puñado de
 * palabras del torneo que serían lo primero que probaría cualquiera.
 */
const MINIMO = 8;

const PROHIBIDAS = [
  "torneo",
  "socorro",
  "torneosocorro",
  "password",
  "contrasena",
  "contraseña",
  "qwerty",
  "admin",
  "delegado",
  "comite",
  "comité",
];

function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Devuelve el motivo por el que la contraseña no sirve, o null si está bien.
 * El mensaje se le muestra tal cual al usuario, así que dice qué hacer.
 */
export function motivoContrasenaInvalida(password: string, username?: string): string | null {
  if (password.length < MINIMO) {
    return `La contraseña debe tener al menos ${MINIMO} caracteres. Lo más fácil de recordar son tres palabras seguidas, por ejemplo "mi perro come arroz".`;
  }
  if (/^\d+$/.test(password)) {
    return 'La contraseña no puede ser solo números: son las primeras que prueba cualquiera. Usa palabras, por ejemplo "mi perro come arroz".';
  }
  const limpia = sinTildes(password).replace(/\s+/g, "");
  if (username && limpia.includes(sinTildes(username).replace(/\s+/g, ""))) {
    return "La contraseña no puede contener tu nombre de usuario.";
  }
  if (PROHIBIDAS.some((mala) => limpia === mala || limpia.startsWith(mala))) {
    return "Esa contraseña es demasiado fácil de adivinar. Usa algo que solo tú sepas: tres palabras seguidas funcionan bien.";
  }
  return null;
}
