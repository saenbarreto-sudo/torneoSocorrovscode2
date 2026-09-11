import { Router, type IRouter } from "express";
import { and, eq, desc, inArray, isNull } from "drizzle-orm";
import { db, mesasTable, pagosTable, egresosTable, equiposTable, ESTADOS_MESA } from "@workspace/db";
import type { EstadoMesa } from "@workspace/db";
import { requireAuth, writeAccess } from "../lib/permissions";
import { filtroTemporada, temporadaPedida } from "../lib/temporada";

const router: IRouter = Router();

/**
 * La mesa: la caja de un día de juego. Los ingresos se guardan como pagos
 * de los equipos y los gastos como egresos del torneo, ambos enlazados a la
 * mesa por mesa_id. Así la mesa no es una bolsa de plata aparte: entra sola
 * al saldo de Tesorería y, si un equipo queda debiendo, sale de una vez en
 * su estado de cuenta.
 */

// Las etiquetas que distinguen las líneas de la mesa dentro de pagos y
// egresos. Se usan solo como texto (no hay catálogo aparte) igual que el
// resto de conceptos del torneo.
const CONCEPTO_MESA = "Mesa";
const CONCEPTO_CINTA = "Cinta de capitán";

function esFechaValida(valor: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

async function totalesDeMesa(mesaId: number) {
  const ingresos = await db.select().from(pagosTable).where(eq(pagosTable.mesaId, mesaId));
  const egresos = await db.select().from(egresosTable).where(eq(egresosTable.mesaId, mesaId));
  const totalIngresos = ingresos.reduce((s, p) => s + p.monto, 0);
  const totalEgresos = egresos.reduce((s, e) => s + e.valor, 0);
  return { ingresos, egresos, totalIngresos, totalEgresos, saldo: totalIngresos - totalEgresos };
}

function mapMesa(
  mesa: typeof mesasTable.$inferSelect,
  totales: { totalIngresos: number; totalEgresos: number; saldo: number },
) {
  return {
    id: mesa.id,
    fecha: mesa.fecha,
    nombre: mesa.nombre,
    estado: mesa.estado,
    observaciones: mesa.observaciones,
    ...totales,
  };
}

/** El cuadre completo de un día, tal como lo consume la pantalla. */
async function detalleDeFecha(fecha: string) {
  // Sin filtro de temporada: la fecha ya identifica una sola mesa (es
  // única), así que sirve igual para el torneo en curso y para uno cerrado.
  const [mesa] = await db.select().from(mesasTable).where(eq(mesasTable.fecha, fecha));
  if (!mesa) {
    return { fecha, mesa: null, ingresos: [], egresos: [], totalIngresos: 0, totalEgresos: 0, saldo: 0 };
  }

  const { ingresos, egresos, totalIngresos, totalEgresos, saldo } = await totalesDeMesa(mesa.id);

  const equipoIds = [...new Set(ingresos.map((p) => p.equipoId).filter((id): id is number => id != null))];
  const equipos = equipoIds.length
    ? await db.select().from(equiposTable).where(inArray(equiposTable.id, equipoIds))
    : [];
  const nombrePorEquipo = new Map(equipos.map((e) => [e.id, e.nombre]));

  return {
    fecha,
    mesa: mapMesa(mesa, { totalIngresos, totalEgresos, saldo }),
    ingresos: ingresos.map((p) => ({
      id: p.id,
      equipoId: p.equipoId,
      equipoNombre: p.equipoId != null ? (nombrePorEquipo.get(p.equipoId) ?? null) : null,
      concepto: p.concepto,
      monto: p.monto,
    })),
    egresos: egresos.map((e) => ({
      id: e.id,
      categoria: e.categoria,
      descripcion: e.descripcion,
      valor: e.valor,
      partidoId: e.partidoId,
    })),
    totalIngresos,
    totalEgresos,
    saldo,
  };
}

router.get("/mesas", requireAuth, async (req, res): Promise<void> => {
  const mesas = await db
    .select()
    .from(mesasTable)
    .where(filtroTemporada(mesasTable.temporada, temporadaPedida(req)))
    .orderBy(desc(mesasTable.fecha));
  const resultado = [];
  for (const mesa of mesas) {
    const { totalIngresos, totalEgresos, saldo } = await totalesDeMesa(mesa.id);
    resultado.push(mapMesa(mesa, { totalIngresos, totalEgresos, saldo }));
  }
  res.json(resultado);
});

router.get("/mesas/:fecha", requireAuth, async (req, res): Promise<void> => {
  const fecha = String(req.params.fecha);
  if (!esFechaValida(fecha)) {
    res.status(400).json({ error: "Fecha inválida, se espera AAAA-MM-DD" });
    return;
  }

  // Un día sin mesa todavía no es un error: la pantalla lo muestra en blanco.
  res.json(await detalleDeFecha(fecha));
});

router.put("/mesas/:fecha", requireAuth, writeAccess.pagos, async (req, res): Promise<void> => {
  const fecha = String(req.params.fecha);
  if (!esFechaValida(fecha)) {
    res.status(400).json({ error: "Fecha inválida, se espera AAAA-MM-DD" });
    return;
  }

  const body = (req.body ?? {}) as {
    nombre?: unknown;
    observaciones?: unknown;
    ingresos?: unknown;
    egresos?: unknown;
  };

  if (!Array.isArray(body.ingresos) || !Array.isArray(body.egresos)) {
    res.status(400).json({ error: "Se esperan las listas de ingresos y egresos" });
    return;
  }

  const ingresos = body.ingresos.map((linea) => {
    const l = (linea ?? {}) as Record<string, unknown>;
    return {
      equipoId: typeof l.equipoId === "number" ? l.equipoId : null,
      concepto: String(l.concepto ?? CONCEPTO_MESA),
      monto: Math.round(Number(l.monto ?? 0)),
    };
  });
  const egresos = body.egresos.map((linea) => {
    const l = (linea ?? {}) as Record<string, unknown>;
    return {
      categoria: l.categoria == null ? null : String(l.categoria),
      descripcion: String(l.descripcion ?? ""),
      valor: Math.round(Number(l.valor ?? 0)),
      // Solo el arbitraje lo usa: un día tiene varios partidos y cada uno
      // puede llevar su propio árbitro.
      partidoId: typeof l.partidoId === "number" ? l.partidoId : null,
    };
  });

  if (ingresos.some((i) => !Number.isFinite(i.monto) || i.monto < 0)) {
    res.status(400).json({ error: "Hay un ingreso con un valor inválido" });
    return;
  }
  if (egresos.some((e) => !Number.isFinite(e.valor) || e.valor < 0 || !e.descripcion)) {
    res.status(400).json({ error: "Hay un gasto sin descripción o con un valor inválido" });
    return;
  }
  // Todo ingreso de la mesa es de un equipo: tanto el arbitraje como las
  // cintas de capitán, que las compra el capitán de un equipo. Así queda en
  // el estado de cuenta de ese equipo y no como plata suelta sin dueño.
  if (ingresos.some((i) => i.equipoId == null)) {
    res.status(400).json({ error: "Cada ingreso de la mesa debe indicar el equipo que pagó" });
    return;
  }

  const [existente] = await db
    .select()
    .from(mesasTable)
    .where(and(eq(mesasTable.fecha, fecha), isNull(mesasTable.temporada)));
  if (existente?.estado === "cerrada") {
    res.status(409).json({ error: "Esta mesa ya está cerrada. Ábrela de nuevo si necesitas corregirla." });
    return;
  }

  const nombre = typeof body.nombre === "string" && body.nombre.trim() ? body.nombre.trim() : null;
  const observaciones =
    typeof body.observaciones === "string" && body.observaciones.trim() ? body.observaciones.trim() : null;

  const mesa =
    existente ??
    (await db.insert(mesasTable).values({ fecha, nombre, observaciones }).returning())[0];

  if (existente) {
    await db.update(mesasTable).set({ nombre, observaciones }).where(eq(mesasTable.id, mesa.id));
  }

  // La planilla se guarda completa: se reemplazan las líneas anteriores de
  // esta mesa por las que acaban de llegar. Solo toca las filas enlazadas a
  // esta mesa, nunca el resto de pagos o egresos del torneo.
  await db.delete(pagosTable).where(eq(pagosTable.mesaId, mesa.id));
  await db.delete(egresosTable).where(eq(egresosTable.mesaId, mesa.id));

  if (ingresos.length > 0) {
    await db.insert(pagosTable).values(
      ingresos.map((i) => ({
        equipoId: i.equipoId!,
        concepto: i.concepto,
        monto: i.monto,
        fecha,
        mesaId: mesa.id,
      })),
    );
  }
  if (egresos.length > 0) {
    await db.insert(egresosTable).values(
      egresos.map((e) => ({
        fecha,
        descripcion: e.descripcion,
        categoria: e.categoria,
        partidoId: e.partidoId,
        valor: e.valor,
        mesaId: mesa.id,
      })),
    );
  }

  res.json(await detalleDeFecha(fecha));
});

router.patch("/mesas/:id/estado", requireAuth, writeAccess.pagos, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const estado = (req.body ?? {}).estado as EstadoMesa;
  if (!ESTADOS_MESA.includes(estado)) {
    res.status(400).json({ error: "Estado inválido" });
    return;
  }

  const [mesa] = await db
    .update(mesasTable)
    .set({ estado, cerradaAt: estado === "cerrada" ? new Date() : null })
    .where(eq(mesasTable.id, id))
    .returning();

  if (!mesa) {
    res.status(404).json({ error: "Mesa no encontrada" });
    return;
  }

  const { totalIngresos, totalEgresos, saldo } = await totalesDeMesa(mesa.id);
  res.json(mapMesa(mesa, { totalIngresos, totalEgresos, saldo }));
});

export default router;
