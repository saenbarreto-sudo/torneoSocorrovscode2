import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db, eventosTable } from "@workspace/db";
import { requireAuth, requireRole } from "../lib/require-auth";

const router: IRouter = Router();

/**
 * El registro de actividad solo lo ve el Comité Organizador: dice quién
 * hizo qué, y eso no es información para los delegados.
 */
router.get("/eventos", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { usuarioId, accion, desde, hasta, limite } = req.query as Record<string, string | undefined>;

  const condiciones: SQL[] = [];
  if (usuarioId && Number.isFinite(Number(usuarioId))) {
    condiciones.push(eq(eventosTable.usuarioId, Number(usuarioId)));
  }
  if (accion) condiciones.push(eq(eventosTable.accion, accion));
  // Las fechas llegan como día suelto; se cubre el día completo.
  if (desde) condiciones.push(gte(eventosTable.createdAt, new Date(`${desde}T00:00:00`)));
  if (hasta) condiciones.push(lte(eventosTable.createdAt, new Date(`${hasta}T23:59:59.999`)));

  // Tope por defecto para que la pantalla no intente dibujar el torneo
  // entero de una; el filtro de fechas es el que sirve para ir más atrás.
  const tope = Math.min(Math.max(Number(limite) || 200, 1), 1000);

  const filas = await db
    .select()
    .from(eventosTable)
    .where(condiciones.length > 0 ? and(...condiciones) : undefined)
    .orderBy(desc(eventosTable.createdAt), desc(eventosTable.id))
    .limit(tope);

  res.json(
    filas.map((e) => ({
      id: e.id,
      usuarioId: e.usuarioId,
      usuarioNombre: e.usuarioNombre,
      accion: e.accion,
      entidad: e.entidad,
      entidadId: e.entidadId,
      descripcion: e.descripcion,
      cambios: (e.cambios as Array<{ campo: string; antes: string; despues: string }> | null) ?? [],
      createdAt: e.createdAt.toISOString(),
    })),
  );
});

export default router;
