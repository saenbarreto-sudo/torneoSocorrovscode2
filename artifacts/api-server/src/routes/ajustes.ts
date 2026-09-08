import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, ajustesTable } from "@workspace/db";
import { requireAuth, writeAccess } from "../lib/permissions";
import { GetAjustesResponse, UpdateAjustesBody, UpdateAjustesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const AJUSTES_ID = 1;

/**
 * Ajustes es una tabla "singleton": siempre existe (o se crea) una única
 * fila con id=1. Así el resto del backend puede simplemente pedir "los
 * ajustes" sin manejar el caso de que no haya ninguno todavía.
 */
async function obtenerOCrearAjustes() {
  const [existentes] = await db.select().from(ajustesTable).where(eq(ajustesTable.id, AJUSTES_ID));
  if (existentes) return existentes;
  const [creados] = await db.insert(ajustesTable).values({ id: AJUSTES_ID }).returning();
  return creados;
}

function formatAjustes(a: typeof ajustesTable.$inferSelect) {
  return { ...a, updatedAt: a.updatedAt.toISOString() };
}

router.get("/ajustes", async (_req, res): Promise<void> => {
  const ajustes = await obtenerOCrearAjustes();
  res.json(GetAjustesResponse.parse(formatAjustes(ajustes)));
});

router.patch("/ajustes", requireAuth, writeAccess.ajustes, async (req, res): Promise<void> => {
  const parsed = UpdateAjustesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await obtenerOCrearAjustes(); // asegura que la fila exista antes de actualizarla
  const [actualizados] = await db
    .update(ajustesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(ajustesTable.id, AJUSTES_ID))
    .returning();
  res.json(UpdateAjustesResponse.parse(formatAjustes(actualizados)));
});

export default router;
