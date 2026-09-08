import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usuariosRouter from "./usuarios";
import equiposRouter from "./equipos";
import jugadoresRouter from "./jugadores";
import partidosRouter from "./partidos";
import golesRouter from "./goles";
import planillaRouter from "./planilla";
import tarjetasRouter from "./tarjetas";
import pagosRouter from "./pagos";
import egresosRouter from "./egresos";
import posicionesRouter from "./posiciones";
import goleadoresRouter from "./goleadores";
import programacionRouter from "./programacion";
import dashboardRouter from "./dashboard";
import ajustesRouter from "./ajustes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usuariosRouter);
router.use(dashboardRouter);
router.use(equiposRouter);
router.use(jugadoresRouter);
router.use(partidosRouter);
router.use(golesRouter);
router.use(planillaRouter);
router.use(tarjetasRouter);
router.use(pagosRouter);
router.use(egresosRouter);
router.use(posicionesRouter);
router.use(goleadoresRouter);
router.use(programacionRouter);
router.use(ajustesRouter);

export default router;
