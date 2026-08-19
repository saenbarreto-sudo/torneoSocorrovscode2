import { Router, type IRouter } from "express";
import { db, programacionTable } from "@workspace/db";
import { requireAuth, writeAccess } from "../lib/permissions";
import {
  CreateSemanaFechaBody,
  CreateSemanaFechaResponse,
  GetProgramacionResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/programacion", async (_req, res): Promise<void> => {
  const rows = await db.select().from(programacionTable).orderBy(programacionTable.semana);
  res.json(GetProgramacionResponse.parse(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() }))));
});

router.post("/programacion", requireAuth, writeAccess.programacion, async (req, res): Promise<void> => {
  const parsed = CreateSemanaFechaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [inserted] = await db.insert(programacionTable).values(parsed.data).returning();
  res.status(201).json(CreateSemanaFechaResponse.parse({ ...inserted, createdAt: inserted.createdAt.toISOString() }));
});

export default router;
