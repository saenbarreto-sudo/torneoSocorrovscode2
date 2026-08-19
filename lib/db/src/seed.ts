import { eq } from "drizzle-orm";
import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Carga el ".env" de la raíz del monorepo (necesario porque este script se
// ejecuta de forma independiente con "pnpm db:seed", no a través de
// api-server, que ya hace esto por su cuenta).
function loadRootEnv() {
  // lib/db/src/seed.ts -> ../../../.env llega a la raíz del monorepo.
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

// Usuarios iniciales solicitados. Puedes crear más (o cambiar estos) desde
// la app una vez ingreses como Comité Organizador → sección "Usuarios".
const seedUsers: Array<{
  username: string;
  password: string;
  nombre: string;
  rol: "admin" | "tesorero" | "mesa" | "delegado";
}> = [
  { username: "sabik.barreto", password: "2026", nombre: "Sabik Barreto", rol: "admin" },
  { username: "olga.barreto", password: "2023", nombre: "Olga Barreto", rol: "tesorero" },
];

async function main() {
  for (const u of seedUsers) {
    const [existing] = await db
      .select()
      .from(usuariosTable)
      .where(eq(usuariosTable.username, u.username));

    if (existing) {
      console.log(`Usuario "${u.username}" ya existe, se omite.`);
      continue;
    }

    await db.insert(usuariosTable).values({
      username: u.username,
      passwordHash: hashPassword(u.password),
      nombre: u.nombre,
      rol: u.rol,
      activo: true,
    });
    console.log(`✓ Usuario creado: ${u.username} (${u.rol}) — contraseña: ${u.password}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error al crear usuarios iniciales:", err);
  process.exit(1);
});
