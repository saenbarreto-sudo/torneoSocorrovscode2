// Reemplaza el antiguo "sh -c '...'" del preinstall, que solo funcionaba en
// Mac/Linux. Node.js sí está garantizado en cualquier sistema (Windows,
// Mac, Linux) porque es el propio motor que corre pnpm, así que este script
// funciona igual en los tres sin depender de bash/sh.
import { existsSync, unlinkSync } from "node:fs";

// Borra lockfiles de otros gestores de paquetes si quedaron de un intento
// anterior con npm/yarn.
for (const file of ["package-lock.json", "yarn.lock"]) {
  if (existsSync(file)) {
    unlinkSync(file);
  }
}

// Este monorepo solo soporta pnpm (usa pnpm-workspace.yaml, catalog:, etc).
const userAgent = process.env.npm_config_user_agent ?? "";
if (!userAgent.startsWith("pnpm/")) {
  console.error(
    'Este proyecto requiere pnpm. Instala con "corepack enable && corepack prepare pnpm@latest --activate" y vuelve a intentar con "pnpm install".',
  );
  process.exit(1);
}
