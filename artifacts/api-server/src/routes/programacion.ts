import { Router, type IRouter } from "express";
import { eq, and, isNull, gte, lte } from "drizzle-orm";
import { db, programacionTable, partidosTable } from "@workspace/db";
import { requireAuth, writeAccess } from "../lib/permissions";
import { filtroTemporada, temporadaPedida } from "../lib/temporada";
import {
  CreateSemanaFechaBody,
  CreateSemanaFechaResponse,
  GetProgramacionResponse,
  UpdateSemanaFechaParams,
  UpdateSemanaFechaBody,
  UpdateSemanaFechaResponse,
  DeleteSemanaFechaParams,
  DeleteSemanaFechaResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/programacion", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(programacionTable)
    .where(filtroTemporada(programacionTable.temporada, temporadaPedida(req)))
    .orderBy(programacionTable.semana);
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

router.patch("/programacion/:id", requireAuth, writeAccess.programacion, async (req, res): Promise<void> => {
  const params = UpdateSemanaFechaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateSemanaFechaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db.update(programacionTable).set(parsed.data).where(eq(programacionTable.id, params.data.id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Semana not found" });
    return;
  }
  res.json(UpdateSemanaFechaResponse.parse({ ...updated, createdAt: updated.createdAt.toISOString() }));
});

// Borrar una semana del cronograma se lleva con ella todos los partidos que
// cubre (y, en cadena, sus goles/tarjetas/planilla — ya configurados con ON
// DELETE CASCADE desde partidos). Solo toca el torneo actual (temporada IS
// NULL).
//
// Qué partidos "cubre" una Programación: si tiene fechaDesde/fechaHasta (el
// caso normal — las pone el lote de "Generar calendario" al guardar), son
// los que caen en ese rango; con fecha por partido, una sola Programación
// puede agrupar varios partidos con distintos números de semana, así que
// el número de semana ya no sirve para esto. Si por algún motivo la
// Programación no tiene fechas (ej. una fila vieja o creada a mano sin
// rango), se cae al criterio anterior de número de semana exacto — mismo
// que usa la impresión (ver ProgramacionImprimible en programacion.tsx).
router.delete("/programacion/:id", requireAuth, writeAccess.programacion, async (req, res): Promise<void> => {
  const params = DeleteSemanaFechaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const resultado = await db.transaction(async (tx) => {
    const [semana] = await tx.select().from(programacionTable).where(eq(programacionTable.id, params.data.id));
    if (!semana) return null;

    const condicionPartidos =
      semana.fechaDesde && semana.fechaHasta
        ? and(gte(partidosTable.fecha, semana.fechaDesde), lte(partidosTable.fecha, semana.fechaHasta))
        : eq(partidosTable.semana, semana.semana);

    const partidosBorrados = await tx
      .delete(partidosTable)
      .where(and(condicionPartidos, isNull(partidosTable.temporada)))
      .returning({ id: partidosTable.id });

    await tx.delete(programacionTable).where(eq(programacionTable.id, params.data.id));

    return { partidosEliminados: partidosBorrados.length };
  });

  if (!resultado) {
    res.status(404).json({ error: "Semana not found" });
    return;
  }
  res.json(DeleteSemanaFechaResponse.parse(resultado));
});

export default router;
