import { defineConfig } from "drizzle-kit";
import { existsSync, readFileSync } from "fs";
import path from "path";

// Carga el ".env" de la raíz del monorepo para desarrollo local en VSCode
// (no sobrescribe variables ya presentes en el entorno, p. ej. en Replit).
function loadRootEnv() {
  const envPath = path.resolve(__dirname, "../../.env");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf-8").split("\n")) {
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
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadRootEnv();

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL, ensure the database is provisioned (copia .env.example a .env en la raíz del proyecto)",
  );
}

export default defineConfig({
  // drizzle-kit busca este archivo usando un patrón "glob" internamente, que
  // solo entiende barras "/" (estilo Unix). En Windows, path.join genera
  // barras invertidas "\", lo que hace que no encuentre el archivo aunque sí
  // exista ("No schema files found..."). Por eso normalizamos a "/" aquí.
  schema: path.join(__dirname, "./src/schema/index.ts").split(path.sep).join("/"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
