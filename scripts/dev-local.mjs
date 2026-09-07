// Levanta el backend (api-server) y el frontend (torneo-socorro) juntos
// para desarrollo local. Reemplaza al antiguo scripts/dev-local.sh, que
// dependía de bash y no funcionaba en Windows (CMD/PowerShell) a menos que
// se configurara Git Bash como "script-shell". Este script usa solo Node.js
// (child_process), así que funciona igual en Windows, Mac y Linux.
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const isWindows = process.platform === "win32";

/**
 * El modo normal de trabajo es Docker (docker compose up -d), que ya ocupa
 * los puertos 4000 y 5173. Si se corre "pnpm dev" encima, Node falla con un
 * "EADDRINUSE" que no explica nada. Mejor avisar antes con algo entendible.
 */
function puertoOcupado(puerto) {
  return new Promise((resolve) => {
    const servidor = createServer();
    servidor.once("error", (err) => resolve(err.code === "EADDRINUSE"));
    servidor.once("listening", () => servidor.close(() => resolve(false)));
    servidor.listen(puerto);
  });
}

const PUERTOS = [
  { numero: Number(process.env.PORT ?? 4000), nombre: "backend" },
  { numero: Number(process.env.FRONTEND_PORT ?? 5173), nombre: "frontend" },
];

const ocupados = [];
for (const p of PUERTOS) {
  if (await puertoOcupado(p.numero)) ocupados.push(p);
}

if (ocupados.length > 0) {
  const lista = ocupados.map((p) => `${p.numero} (${p.nombre})`).join(" y ");
  console.error(
    ocupados.length === 1
      ? `\nEl puerto ${lista} ya está en uso.`
      : `\nLos puertos ${lista} ya están en uso.`,
  );
  console.error(
    "\nCasi siempre es porque la aplicación ya está corriendo en Docker,\n" +
      "que es la forma normal de usarla. Compruébalo con:\n" +
      "\n  docker compose ps\n" +
      "\nSi aparece como \"Up\", no hace falta 'pnpm dev': abre http://localhost:5173\n" +
      "Si quieres correrla fuera de Docker, apaga primero los contenedores:\n" +
      "\n  docker compose stop\n",
  );
  process.exit(1);
}
const pnpmCmd = isWindows ? "pnpm.cmd" : "pnpm";

const processes = [
  spawn(pnpmCmd, ["--filter", "@workspace/api-server", "run", "dev"], {
    stdio: "inherit",
    shell: isWindows,
  }),
  spawn(pnpmCmd, ["--filter", "@workspace/torneo-socorro", "run", "dev"], {
    stdio: "inherit",
    shell: isWindows,
  }),
];

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\nDeteniendo servidores...");
  for (const child of processes) {
    if (!child.killed) child.kill();
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

for (const child of processes) {
  child.on("exit", (code) => {
    if (!shuttingDown && code !== 0) {
      console.error(`Un proceso terminó con código ${code}, deteniendo todo...`);
    }
    shutdown();
  });
}
