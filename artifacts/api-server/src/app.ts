import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { registroDeEventos } from "./lib/registro-eventos";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// 8mb: la foto de carnet del jugador viaja como data URL (base64) dentro
// del body JSON normal, y el límite por defecto de Express (100kb) se
// queda corto para eso.
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));

// Va justo antes del router y después de express.json: necesita el cuerpo
// ya leído para poder decir qué cambió.
app.use("/api", registroDeEventos());
app.use("/api", router);

export default app;
