import { Router, type IRouter } from "express";
import { eq, desc, isNull } from "drizzle-orm";
import { db, egresosTable } from "@workspace/db";
import { requireAuth, writeAccess } from "../lib/permissions";
import { respondIfDeleteBlocked } from "../lib/delete-errors";
import {
  CreateEgresoBody,
  CreateEgresoResponse,
  GetEgresosResponse,
  DeleteEgresoParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function mapEgreso(row: typeof egresosTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/egresos", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(egresosTable)
    .where(isNull(egresosTable.temporada))
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
