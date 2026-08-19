// Levanta el backend (api-server) y el frontend (torneo-socorro) juntos
// para desarrollo local. Reemplaza al antiguo scripts/dev-local.sh, que
// dependía de bash y no funcionaba en Windows (CMD/PowerShell) a menos que
// se configurara Git Bash como "script-shell". Este script usa solo Node.js
// (child_process), así que funciona igual en Windows, Mac y Linux.
import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
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
