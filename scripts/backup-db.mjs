// Guarda una copia de seguridad completa de la base de datos del torneo en
// la carpeta "backups/" de la raíz del proyecto.
//
//   pnpm db:backup
//
// El respaldo se hace con pg_dump DENTRO del contenedor de Postgres, así que
// no hace falta tener Postgres instalado en el computador: basta con que el
// stack de Docker esté levantado (docker compose up -d).
//
// Se usa solo Node.js (child_process), sin bash, para que funcione igual en
// Windows, Mac y Linux — el mismo motivo que scripts/dev-local.mjs.
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const SERVICIO_DB = "db";
const USUARIO_DB = process.env.POSTGRES_USER ?? "torneo";
const NOMBRE_DB = process.env.POSTGRES_DB ?? "torneo_socorro";
const CARPETA = "backups";

/** "2026-09-07_1432" — ordena alfabéticamente igual que cronológicamente. */
function marcaDeTiempo() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function formatearTamano(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

mkdirSync(CARPETA, { recursive: true });
const archivo = join(CARPETA, `torneo-socorro-${marcaDeTiempo()}.sql`);

console.log("Creando copia de seguridad de la base de datos...");

// --clean --if-exists hace que el archivo se pueda restaurar sobre una base
// que ya tiene datos, sin tener que borrarla antes a mano.
const args = [
  "compose", "exec", "-T", SERVICIO_DB,
  "pg_dump", "--clean", "--if-exists", "--no-owner", "--no-privileges",
  "-U", USUARIO_DB, NOMBRE_DB,
];

const dump = spawn("docker", args, {
  stdio: ["ignore", "pipe", "pipe"],
});

const salida = createWriteStream(archivo);

// pipe() cierra "salida" solo cuando pg_dump termina de escribir, y ese cierre
// puede ocurrir ANTES de que llegue el "close" del proceso. Por eso se espera
// con una promesa creada de una vez: si el evento ya pasó, ya está resuelta.
const archivoCerrado = new Promise((resolve, reject) => {
  salida.on("close", resolve);
  salida.on("error", reject);
});

dump.stdout.pipe(salida);

let errores = "";
dump.stderr.on("data", (chunk) => {
  errores += chunk.toString();
});

dump.on("error", (err) => {
  console.error(`\nNo se pudo ejecutar Docker: ${err.message}`);
  console.error('¿Está instalado Docker Desktop y corriendo? Prueba: docker compose ps');
  process.exit(1);
});

dump.on("close", async (code) => {
  await archivoCerrado;

  if (code !== 0) {
    // Un archivo a medias es peor que ninguno: da falsa sensación de respaldo.
    try {
      unlinkSync(archivo);
    } catch {
      /* si no existe, no importa */
    }
    console.error("\nFalló el respaldo.");
    if (errores.trim()) console.error(errores.trim());
    console.error(
      "\nRevisa que el contenedor de la base esté levantado:\n  docker compose up -d db",
    );
    process.exit(1);
  }

  const { size } = statSync(archivo);
  console.log(`\n✓ Respaldo guardado en: ${archivo}  (${formatearTamano(size)})`);
  console.log("\nGuarda una copia fuera de este computador (nube, USB, correo).");
  console.log("Para restaurarlo más adelante:");
  console.log(`  pnpm db:restore ${archivo}`);
});
