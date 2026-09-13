import { Router, type IRouter } from "express";
import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import { db, pagosTable, equiposTable, tarjetasTable } from "@workspace/db";
import { filtroTemporadaSql, temporadaPedida } from "../lib/temporada";
import { requireAuth, writeAccess } from "../lib/permissions";
import {
  CreatePagoBody,
  CreatePagoResponse,
  GetPagosResponse,
  GetPagosQueryParams,
  UpdatePagoBody,
  UpdatePagoParams,
  UpdatePagoResponse,
  DeletePagoParams,
  GetPagosResumenEquiposResponse,
  GetPagosResumenEquiposQueryParams,
} from "@workspace/api-zod";
import { requiereSesion, equipoAConsultar } from "../lib/alcance";

const router: IRouter = Router();

// Sistema de numeración de recibos por concepto, tal como lo maneja Olga:
// cada concepto lleva su propio consecutivo (INS001, INS002...; A001,
// A002...; R001...), en vez de un solo número global mezclando todo.
const PREFIJOS_CONCEPTO: Record<string, string> = {
  Inscripcion: "INS",
  Amarillas: "A",
  Rojas: "R",
  Carnet: "C",
  Multas: "M",
  FOFI: "F",
  Traspaso: "T",
};

function prefijoParaConcepto(concepto: string): string {
  return PREFIJOS_CONCEPTO[concepto] ?? "P";
}

async function siguienteCodigoRecibo(concepto: string): Promise<string> {
  const prefijo = prefijoParaConcepto(concepto);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(pagosTable)
    // Solo el torneo en curso: la numeración de recibos arranca de nuevo
    // en cada torneo (ver schema/temporadas.ts).
    .where(and(eq(pagosTable.concepto, concepto), isNull(pagosTable.temporada)));
  const siguiente = Number(count ?? 0) + 1;
  return `${prefijo}${String(siguiente).padStart(3, "0")}`;
}

function mapPago(row: Record<string, unknown>) {
  return {
    id: row.id,
    nRecibo: row.n_recibo ?? row.nRecibo ?? null,
    codigoRecibo: row.codigo_recibo ?? row.codigoRecibo ?? null,
    equipoId: row.equipo_id ?? row.equipoId,
    equipoNombre: row.equipo_nombre ?? row.equipoNombre ?? "",
    concepto: row.concepto,
    monto: Number(row.monto),
    semana: row.semana ?? null,
    mes: row.mes ?? null,
    fecha: row.fecha ?? null,
    tarjetaId: row.tarjeta_id ?? row.tarjetaId ?? null,
    // Marca de dónde entró la plata: si viene de la mesa de un día de juego
    // no es un recibo (no lleva consecutivo), y las vistas de recibos lo
    // dejan fuera. Ver el comentario en schema/pagos.ts.
    mesaId: row.mesa_id ?? row.mesaId ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

router.get("/pagos/resumen-equipos", requiereSesion, async (req, res): Promise<void> => {
  const temporada = temporadaPedida(req);
  const query = GetPagosResumenEquiposQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const concepto = query.data.concepto ?? "Inscripcion";

  // "Inscripcion" es el único concepto con un monto adeudado configurado
  // por equipo (equipos.deuda_inscripcion), así que es el único donde
  // "saldo" y "% pagado" significan algo. Para los demás (Multas, Carnet,
  // tarjetas, FOFI) no hay una meta contra la cual comparar: solo se puede
  // mostrar cuánto se ha pagado, y deuda/saldo/porcentaje quedan en 0.
  const esInscripcion = concepto === "Inscripcion";
  // El delegado ve su renglón y nada más: lo que deben los otros equipos no
  // es asunto suyo.
  const equipoAcotado = equipoAConsultar(req.quien!, null);

  const rows = await db.execute(sql`
    SELECT
      e.id as equipo_id,
      e.nombre as equipo_nombre,
      ${esInscripcion ? sql`e.deuda_inscripcion` : sql`0`} as deuda_total,
      COALESCE(SUM(CASE WHEN p.concepto = ${concepto} THEN p.monto ELSE 0 END), 0)::int as pagado,
      ${esInscripcion
        ? sql`(e.deuda_inscripcion - COALESCE(SUM(CASE WHEN p.concepto = ${concepto} THEN p.monto ELSE 0 END), 0))::int`
        : sql`0`
      } as saldo,
      ${esInscripcion
        ? sql`CASE WHEN e.deuda_inscripcion > 0
            THEN ROUND(COALESCE(SUM(CASE WHEN p.concepto = ${concepto} THEN p.monto ELSE 0 END), 0) / e.deuda_inscripcion::numeric, 4)
            ELSE 0
          END`
        : sql`0`
      } as porcentaje_pagado
    FROM equipos e
    LEFT JOIN pagos p ON p.equipo_id = e.id AND ${filtroTemporadaSql("p.temporada", temporada)}
    WHERE e.activo = true
      ${equipoAcotado != null ? sql`AND e.id = ${equipoAcotado}` : sql``}
    GROUP BY e.id, e.nombre, e.deuda_inscripcion
    ORDER BY pagado DESC
  `);
  const data = (rows.rows ?? rows).map((r: Record<string, unknown>) => ({
    equipoId: r.equipo_id,
    equipoNombre: r.equipo_nombre,
    deudaTotal: Number(r.deuda_total),
    pagado: Number(r.pagado),
    saldo: Number(r.saldo),
    porcentajePagado: Number(r.porcentaje_pagado),
  }));
  res.json(GetPagosResumenEquiposResponse.parse(data));
});

router.get("/pagos", requiereSesion, async (req, res): Promise<void> => {
  const temporada = temporadaPedida(req);
  const query = GetPagosQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions: SQL[] = [];
  // Igual que en jugadores: para el delegado el equipo sale de su usuario,
  // así que tocar el ?equipoId= de la URL no lo saca de su equipo.
  const equipoDeLosRecibos = equipoAConsultar(req.quien!, query.data.equipoId);
  if (equipoDeLosRecibos != null) {
    conditions.push(sql`p.equipo_id = ${equipoDeLosRecibos}`);
  }
  if (query.data.concepto) {
    conditions.push(sql`p.concepto = ${query.data.concepto}`);
  }
  // Un recibo puede no tener fecha (los viejos cargados a mano): al filtrar
  // por periodo esos quedan fuera, que es lo correcto — no se sabe si caen
  // dentro del rango.
  if (query.data.desde) {
    conditions.push(sql`p.fecha >= ${query.data.desde}`);
  }
  if (query.data.hasta) {
    conditions.push(sql`p.fecha <= ${query.data.hasta}`);
  }
  const whereClause =
    conditions.length > 0 ? sql`AND ${sql.join(conditions, sql` AND `)}` : sql``;

  const rows = await db.execute(sql`
    SELECT p.*, e.nombre as equipo_nombre
    FROM pagos p
    JOIN equipos e ON e.id = p.equipo_id
    WHERE ${filtroTemporadaSql("p.temporada", temporada)}
    ${whereClause}
    ORDER BY p.created_at DESC
  `);
  const data = rows.rows.map(mapPago);
  res.json(GetPagosResponse.parse(data));
});

router.post("/pagos", requireAuth, writeAccess.pagos, async (req, res): Promise<void> => {
  const parsed = CreatePagoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Si el pago liquida una tarjeta amarilla puntual, verificamos que exista
  // y aún no esté pagada antes de continuar.
  if (parsed.data.tarjetaId != null) {
    const [tarjeta] = await db.select().from(tarjetasTable).where(eq(tarjetasTable.id, parsed.data.tarjetaId));
    if (!tarjeta) {
      res.status(400).json({ error: "La tarjeta indicada no existe" });
      return;
    }
    if (tarjeta.pagada) {
      res.status(409).json({ error: "Esa tarjeta ya fue marcada como pagada" });
      return;
    }
  }

  const count = await db.select({ count: sql<number>`count(*)` }).from(pagosTable);
  const nRecibo = (Number(count[0]?.count ?? 0) + 1);
  const codigoRecibo = await siguienteCodigoRecibo(parsed.data.concepto);
  const [inserted] = await db.insert(pagosTable).values({ ...parsed.data, nRecibo, codigoRecibo }).returning();

  if (parsed.data.tarjetaId != null) {
    await db.update(tarjetasTable).set({ pagada: true }).where(eq(tarjetasTable.id, parsed.data.tarjetaId));
  }

  const [equipo] = await db.select().from(equiposTable).where(eq(equiposTable.id, inserted.equipoId));
  res.status(201).json(CreatePagoResponse.parse({
    ...inserted,
    equipoNombre: equipo?.nombre ?? "",
    createdAt: inserted.createdAt.toISOString(),
  }));
});

router.patch("/pagos/:id", requireAuth, writeAccess.pagos, async (req, res): Promise<void> => {
  const params = UpdatePagoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePagoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db.update(pagosTable).set(parsed.data).where(eq(pagosTable.id, params.data.id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Pago not found" });
    return;
  }
  const [equipo] = await db.select().from(equiposTable).where(eq(equiposTable.id, updated.equipoId));
  res.json(UpdatePagoResponse.parse({
    ...updated,
    equipoNombre: equipo?.nombre ?? "",
    createdAt: updated.createdAt.toISOString(),
  }));
});

router.delete("/pagos/:id", requireAuth, writeAccess.pagos, async (req, res): Promise<void> => {
  const params = DeletePagoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db.delete(pagosTable).where(eq(pagosTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Pago not found" });
    return;
  }
  // Si este pago liquidaba una tarjeta amarilla, al borrarlo esa tarjeta
  // vuelve a quedar pendiente (reaparece en la lista de amonestados).
  if (deleted.tarjetaId != null) {
    await db.update(tarjetasTable).set({ pagada: false }).where(eq(tarjetasTable.id, deleted.tarjetaId));
  }
  res.sendStatus(204);
});

export default router;
