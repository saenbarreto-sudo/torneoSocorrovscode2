import { eq } from "drizzle-orm";
import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Llave de repuesto: cambia la contraseña de un usuario desde la línea de
 * comandos, sin necesidad de poder entrar a la app. Es para el único caso
 * que no tiene salida desde la pantalla: que TODOS los administradores
 * olviden su contraseña al mismo tiempo y nadie pueda entrar a reasignarla.
 *
 * Uso:
 *   docker compose exec api pnpm --filter @workspace/db run reset-password <usuario> <contraseña-nueva>
 *
 * Sin argumentos, lista los usuarios que existen para no adivinar el nombre.
 */

// Carga el ".env" de la raíz del monorepo (mismo motivo que en seed.ts: este
// script corre por su cuenta, no a través de api-server).
function loadRootEnv() {
  const candidates = [
    path.resolve(import.meta.dirname, "../../../.env"),
    path.resolve(import.meta.dirname, "../../.env"),
  ];
  const envPath = candidates.find((p) => existsSync(p));
  if (!envPath) return;
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
loadRootEnv();

const { db, usuariosTable } = await import("./index");

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

async function main() {
  const [username, password] = process.argv.slice(2);

  if (!username || !password) {
    const usuarios = await db.select().from(usuariosTable).orderBy(usuariosTable.username);
    console.log("\nUso:");
    console.log(
      "  docker compose exec api pnpm --filter @workspace/db run reset-password <usuario> <contraseña-nueva>\n",
    );
    console.log("Usuarios registrados:");
    for (const u of usuarios) {
      console.log(`  - ${u.username}  (${u.nombre}, ${u.rol}${u.activo ? "" : ", INACTIVO"})`);
    }
    console.log("");
    // Sale bien (no es un error): correrlo sin argumentos es la forma de
    // consultar la ayuda y ver los nombres de usuario.
    process.exit(0);
  }

  if (password.length < 4) {
    console.error("La contraseña debe tener al menos 4 caracteres.");
    process.exit(1);
  }

  const normalizado = username.trim().toLowerCase();
  const [usuario] = await db
    .update(usuariosTable)
    .set({ passwordHash: hashPassword(password) })
    .where(eq(usuariosTable.username, normalizado))
    .returning();

  if (!usuario) {
    console.error(`No existe ningún usuario con el nombre "${normalizado}".`);
    console.error("Corre el comando sin argumentos para ver la lista de usuarios.");
    process.exit(1);
  }

  console.log(`✓ Contraseña actualizada para "${usuario.username}" (${usuario.nombre}).`);
  if (!usuario.activo) {
    console.log("  Ojo: esta cuenta está INACTIVA, no podrá entrar hasta que se reactive.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Error al cambiar la contraseña:", err);
  process.exit(1);
});
