// Restaura la base de datos del torneo desde un archivo creado con
// "pnpm db:backup".
//
//   pnpm db:restore backups/torneo-socorro-2026-09-07_1432.sql
//
// Sin argumento, muestra la lista de respaldos disponibles y no hace nada.
//
// ATENCIÓN: reemplaza TODOS los datos actuales por los del respaldo.
// Por eso pide confirmación escribiendo "RESTAURAR", igual que db:reset.
import { spawn } from "node:child_process";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const SERVICIO_DB = "db";
const USUARIO_DB = process.env.POSTGRES_USER ?? "torneo";
const NOMBRE_DB = process.env.POSTGRES_DB ?? "torneo_socorro";
const CARPETA = "backups";

function listarRespaldos() {
  if (!existsSync(CARPETA)) return [];
  return readdirSync(CARPETA)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse(); // el más reciente primero
}

async function confirmar() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await rl.question(
    '\nEscribe "RESTAURAR" para continuar (cualquier otra cosa cancela): ',
  );
  rl.close();
  return respuesta.trim() === "RESTAURAR";
}

const archivo = process.argv[2];

if (!archivo) {
  const respaldos = listarRespaldos();
  if (respaldos.length === 0) {
    console.log(`No hay respaldos en "${CARPETA}/". Crea uno con:\n  pnpm db:backup`);
  } else {
    console.log("Respaldos disponibles (del más reciente al más antiguo):\n");
    for (const r of respaldos) console.log(`  ${join(CARPETA, r)}`);
    console.log(`\nPara restaurar uno:\n  pnpm db:restore ${join(CARPETA, respaldos[0])}`);
  }
  process.exit(0);
}

if (!existsSync(archivo)) {
  console.error(`No se encontró el archivo: ${archivo}`);
  console.error('Corre "pnpm db:restore" sin argumentos para ver los respaldos disponibles.');
  process.exit(1);
}

const { size, mtime } = statSync(archivo);
console.log(`Respaldo: ${archivo}`);
console.log(`Creado:   ${mtime.toLocaleString("es-CO")}`);
console.log(`Tamaño:   ${(size / 1024).toFixed(1)} KB`);
console.log(
  "\nEsto REEMPLAZA todos los datos actuales de la base (partidos, pagos,\n" +
    "jugadores, equipos y usuarios) por los del respaldo. No se puede deshacer.",
);
console.log("\nSi quieres conservar los datos de ahora, cancela y corre antes: pnpm db:backup");

if (!(await confirmar())) {
  console.log("Cancelado. No se cambió nada.");
  process.exit(0);
}

console.log("\nRestaurando...");

// --single-transaction + ON_ERROR_STOP: si algo falla a mitad de camino, se
// deshace todo y la base queda como estaba. Nunca a medio restaurar.
const args = [
  "compose", "exec", "-T", SERVICIO_DB,
  "psql", "--single-transaction", "-v", "ON_ERROR_STOP=1", "--quiet",
  "-U", USUARIO_DB, "-d", NOMBRE_DB,
];

const psql = spawn("docker", args, {
  // La salida normal de psql es ruido ("setval", "DROP TABLE"...); los
  // problemas de verdad llegan por stderr y se muestran solo si algo falla.
  stdio: ["pipe", "ignore", "pipe"],
});

let errores = "";
psql.stderr.on("data", (chunk) => {
  errores += chunk.toString();
});

psql.on("error", (err) => {
  console.error(`\nNo se pudo ejecutar Docker: ${err.message}`);
  console.error("¿Está instalado Docker Desktop y corriendo? Prueba: docker compose ps");
  process.exit(1);
});

createReadStream(archivo).pipe(psql.stdin);

psql.on("close", (code) => {
  if (code !== 0) {
    console.error("\nFalló la restauración. La base quedó como estaba antes.");
    if (errores.trim()) console.error(errores.trim());
    console.error(
      "\nRevisa que el contenedor de la base esté levantado:\n  docker compose up -d db",
    );
    process.exit(1);
  }
  console.log("\n✓ Base de datos restaurada.");
  console.log("Reinicia la aplicación para ver los datos:\n  docker compose restart api web");
});
