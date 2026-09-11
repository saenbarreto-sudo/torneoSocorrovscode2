import { Router, type IRouter } from "express";
import { and, eq, desc, gte, lte, type SQL } from "drizzle-orm";
import { db, egresosTable } from "@workspace/db";
import { requireAuth, writeAccess } from "../lib/permissions";
import { filtroTemporada, temporadaPedida } from "../lib/temporada";
import { respondIfDeleteBlocked } from "../lib/delete-errors";
import {
  CreateEgresoBody,
  CreateEgresoResponse,
  GetEgresosResponse,
  DeleteEgresoParams,
  UpdateEgresoBody,
  UpdateEgresoResponse,
} from "@workspace/api-zod";
import { soloComite } from "../lib/alcance";

const router: IRouter = Router();

function mapEgreso(row: typeof egresosTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/egresos", soloComite, async (req, res): Promise<void> => {
  const { categoria, desde, hasta } = req.query as Record<string, string | undefined>;

  const condiciones: SQL[] = [filtroTemporada(egresosTable.temporada, temporadaPedida(req))];
  if (categoria) condiciones.push(eq(egresosTable.categoria, categoria));
  if (desde) condiciones.push(gte(egresosTable.fecha, desde));
  if (hasta) condiciones.push(lte(egresosTable.fecha, hasta));

  const rows = await db
    .select()
    .from(egresosTable)
    .where(and(...condiciones))
    .orderBy(desc(egresosTable.fecha));
  res.json(GetEgresosResponse.parse(rows.map(mapEgreso)));
});

router.post("/egresos", requireAuth, writeAccess.pagos, async (req, res): Promise<void> => {
  const parsed = CreateEgresoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [inserted] = await db.insert(egresosTable).values(parsed.data).returning();
  res.status(201).json(CreateEgresoResponse.parse(mapEgreso(inserted)));
});

/**
 * Corregir un gasto ya registrado. Antes tocaba borrarlo y volverlo a
 * crear, que es peor: se pierde el orden real de cuándo se registró y, si
 * salió de una mesa, se pierde el enlace con ese día.
 */
router.patch("/egresos/:id", requireAuth, writeAccess.pagos, async (req, res): Promise<void> => {
  const params = DeleteEgresoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateEgresoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [actualizado] = await db
    .update(egresosTable)
    .set(parsed.data)
    .where(eq(egresosTable.id, params.data.id))
    .returning();

  if (!actualizado) {
    res.status(404).json({ error: "Egreso not found" });
    return;
  }
  res.json(UpdateEgresoResponse.parse(mapEgreso(actualizado)));
});

router.delete("/egresos/:id", requireAuth, writeAccess.pagos, async (req, res): Promise<void> => {
  const params = DeleteEgresoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const [deleted] = await db.delete(egresosTable).where(eq(egresosTable.id, params.data.id)).returning();
    if (!deleted) {
      res.status(404).json({ error: "Egreso not found" });
      return;
    }
    res.sendStatus(204);
  } catch (err) {
    if (respondIfDeleteBlocked(err, res, "este egreso")) return;
    throw err;
  }
});

export default router;
