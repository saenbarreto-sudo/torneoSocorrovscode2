import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Carga variables desde el ".env" en la raíz del monorepo, útil para correr
 * el proyecto localmente en VSCode (Replit inyecta sus propias variables y
 * no necesita esto). No sobrescribe variables que ya estén definidas en el
 * entorno. Si el archivo no existe, se ignora silenciosamente.
 *
 * Funciona tanto en desarrollo (src/lib/load-env.ts) como ya compilado
 * (dist/index.mjs), porque ambos quedan a la misma profundidad relativa a
 * la raíz del monorepo: artifacts/api-server/{src|dist}/../../../.env
 */
function loadRootEnv(): void {
  const candidates = [
    path.resolve(import.meta.dirname, "../../../.env"),
    path.resolve(import.meta.dirname, "../../../../.env"),
  ];

  const envPath = candidates.find((p) => existsSync(p));
  if (!envPath) return;

  const contents = readFileSync(envPath, "utf-8");
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadRootEnv();
