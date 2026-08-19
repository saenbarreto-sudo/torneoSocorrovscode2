/**
 * Reinicia por completo los datos del torneo y carga la información real.
 *
 * Uso:  pnpm db:reset
 *
 * BORRA TODO: planillas, goles, tarjetas, pagos, egresos, partidos,
 * programación, jugadores, equipos y usuarios. No se puede deshacer.
 *
 * Después vuelve a cargar:
 *  - Los 34 equipos y 1.260 jugadores de la Base de Datos de Carné
 *    (src/data/jugadores-2026.json).
 *  - Los usuarios base para poder entrar (Comité Organizador y Tesorería).
 *
 * Pide confirmación antes de borrar, salvo que se pase --si.
 */
import "./load-env-import";
import { createInterface } from "node:readline/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "./index";
import { equiposTable, jugadoresTable, usuariosTable } from "./schema";

interface JugadorImport {
  cedula: string;
  nombre: string;
  fechaNacimiento: string | null;
  equipo: string;
  nCarnet: number | null;
  _revisar?: string;
}

/** Mismo esquema de hash que usa el login (scrypt, sin dependencias extra). */
function hashPassword(password: string): string {
  // El salt debe usarse como Buffer (no como texto hex), porque así lo
  // reconstruye verifyPassword en el backend al validar el login.
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

const USUARIOS_BASE = [
  { username: "sabik.barreto", nombre: "Sabik Barreto", password: "2026", rol: "admin" },
  { username: "olga.barreto", nombre: "Olga Barreto", password: "2023", rol: "tesorero" },
];

async function confirmar(): Promise<boolean> {
  if (process.argv.includes("--si")) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const r = await rl.question(
    "\nEsto BORRA todos los datos del torneo (partidos, pagos, jugadores, equipos y usuarios).\n" +
      'Escribe "BORRAR" para continuar: ',
  );
  rl.close();
  return r.trim().toUpperCase() === "BORRAR";
}

async function main() {
  if (!(await confirmar())) {
    console.log("Cancelado. No se borró nada.");
    process.exit(0);
  }

  const dataPath = path.resolve(import.meta.dirname, "./data/jugadores-2026.json");
  const { equipos, jugadores } = JSON.parse(readFileSync(dataPath, "utf-8")) as {
    equipos: string[];
    jugadores: JugadorImport[];
  };

  await db.transaction(async (tx) => {
    console.log("\nBorrando datos...");
    // TRUNCATE ... CASCADE deja que Postgres resuelva solo el orden de
    // borrado según las llaves foráneas, en vez de mantenerlo a mano (que
    // se rompe cada vez que se agrega una relación nueva).
    // RESTART IDENTITY hace que los id vuelvan a empezar en 1.
    await tx.execute(
      sql.raw(
        `TRUNCATE TABLE
           pagos, egresos, planilla, goles, tarjetas,
           partidos, programacion, usuarios, jugadores, equipos
         RESTART IDENTITY CASCADE`,
      ),
    );

    console.log(`Creando ${equipos.length} equipos...`);
    const creados = await tx
      .insert(equiposTable)
      .values(equipos.map((nombre) => ({ nombre, telefono: "Por definir" })))
      .returning({ id: equiposTable.id, nombre: equiposTable.nombre });
    const porNombre = new Map(creados.map((e) => [e.nombre.trim().toLowerCase(), e.id]));

    const filas = jugadores
      .map((j) => {
        const equipoId = porNombre.get(j.equipo.trim().toLowerCase());
        if (!equipoId) return null;
        return {
          cedula: j.cedula,
          nombre: j.nombre,
          fechaNacimiento: j.fechaNacimiento,
          equipoId,
          nCarnet: j.nCarnet,
          activo: true,
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    console.log(`Insertando ${filas.length} jugadores...`);
    const LOTE = 200;
    for (let i = 0; i < filas.length; i += LOTE) {
      await tx.insert(jugadoresTable).values(filas.slice(i, i + LOTE));
    }

    console.log("Creando usuarios base...");
    await tx.insert(usuariosTable).values(
      USUARIOS_BASE.map((u) => ({
        username: u.username,
        nombre: u.nombre,
        passwordHash: hashPassword(u.password),
        rol: u.rol,
        activo: true,
      })),
    );
  });

  const porRevisar = jugadores.filter((j) => j._revisar);
  if (porRevisar.length > 0) {
    console.log("\nRevisar manualmente (quedaron sin fecha de nacimiento):");
    for (const j of porRevisar) console.log(`  - ${j.nombre} (${j.equipo}): ${j._revisar}`);
  }

  console.log("\nListo. Puedes entrar con:");
  for (const u of USUARIOS_BASE) console.log(`  ${u.username} / ${u.password}  (${u.rol})`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Falló el reinicio:", err);
  process.exit(1);
});
