import { Router, type IRouter } from "express";
import { eq, sql, type SQL } from "drizzle-orm";
import { db, golesTable, jugadoresTable, equiposTable } from "@workspace/db";
import { requireAuth, writeAccess } from "../lib/permissions";
import {
  CreateGolBody,
  CreateGolResponse,
  GetGolesResponse,
  GetGolesQueryParams,
  DeleteGolParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function mapGol(row: Record<string, unknown>) {
  return {
    id: row.id,
    jugadorId: row.jugador_id ?? row.jugadorId,
    jugadorNombre: row.jugador_nombre ?? row.jugadorNombre,
    equipoNombre: row.equipo_nombre ?? row.equipoNombre,
    partidoId: row.partido_id ?? null,
    semana: row.semana,
    fecha: row.fecha ?? null,
    cantidad: row.cantidad,
    propio: row.propio,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

// Lista goles, opcionalmente filtrados por partido (se usa para mostrar y
// editar los goleadores de un partido puntual desde "Partidos y Resultados").
router.get("/goles", async (req, res): Promise<void> => {
  const query = GetGolesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions: SQL[] = [];
  if (query.data.partidoId != null) {
    conditions.push(sql`g.partido_id = ${query.data.partidoId}`);
  }
  const whereClause = conditions.length > 0 ? sql`AND ${sql.join(conditions, sql` AND `)}` : sql``;

  const rows = await db.execute(sql`
    SELECT g.*, j.nombre as jugador_nombre, e.nombre as equipo_nombre
    FROM goles g
    JOIN jugadores j ON j.id = g.jugador_id
    JOIN equipos e ON e.id = j.equipo_id
    WHERE 1=1
    ${whereClause}
    ORDER BY g.created_at DESC
  `);
  res.json(GetGolesResponse.parse(rows.rows.map(mapGol)));
});

router.post("/goles", requireAuth, writeAccess.goles, async (req, res): Promise<void> => {
  const parsed = CreateGolBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [inserted] = await db.insert(golesTable).values(parsed.data).returning();
  const [jugador] = await db
    .select({ nombre: jugadoresTable.nombre, equipoNombre: equiposTable.nombre })
    .from(jugadoresTable)
    .innerJoin(equiposTable, eq(jugadoresTable.equipoId, equiposTable.id))
    .where(eq(jugadoresTable.id, inserted.jugadorId));
  res.status(201).json(CreateGolResponse.parse({
    ...inserted,
    jugadorNombre: jugador?.nombre ?? "",
    equipoNombre: jugador?.equipoNombre ?? "",
    createdAt: inserted.createdAt.toISOString(),
  }));
});

router.delete("/goles/:id", requireAuth, writeAccess.goles, async (req, res): Promise<void> => {
  const params = DeleteGolParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db.delete(golesTable).where(eq(golesTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Gol not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
