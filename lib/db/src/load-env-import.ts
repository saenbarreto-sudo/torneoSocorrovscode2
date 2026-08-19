/**
 * Carga el ".env" de la raíz del monorepo antes de que se abra la conexión
 * a la base de datos. Debe importarse ANTES que "./index", porque ese
 * módulo lee DATABASE_URL al cargarse.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const candidates = [
  path.resolve(import.meta.dirname, "../../../.env"),
  path.resolve(import.meta.dirname, "../../.env"),
];
const envPath = candidates.find((p) => existsSync(p));

if (envPath) {
  for (const rawLine of readFileSync(envPath, "utf-8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
