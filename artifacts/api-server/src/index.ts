// Debe ser el primer import: carga el ".env" de la raíz del monorepo antes
// de que cualquier otro módulo (como @workspace/db) lea process.env.
import "./lib/load-env";

import app from "./app";
import { logger } from "./lib/logger";

// Por defecto usa 4000 en local (VSCode); Replit inyecta su propio PORT.
const rawPort = process.env["PORT"] ?? "4000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
