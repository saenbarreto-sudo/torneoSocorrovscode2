import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, equiposTable, ajustesTable } from "@workspace/db";
import { filtroTemporadaSql, temporadaPedida } from "../lib/temporada";
import { requiereSesion, equipoAConsultar } from "../lib/alcance";
import { GetMiEquipoResponse } from "@workspace/api-zod";

const router: IRouter = Router();

/**
 * Todo lo que el delegado necesita de SU equipo, en una sola consulta: la
 * plantilla con lo de cada jugador, la cuenta con el torneo y el próximo
 * partido.
 *
 * Existe como una ruta propia (y no reutilizando /jugadores + /pagos +
 * /sanciones desde la pantalla) para que el delegado no necesite acceso a
 * ninguna ruta general: acá pide "lo mío" y recibe exactamente lo suyo.
 *
 * El comité también puede usarla pasando ?equipoId= para ver lo que ve un
 * delegado — útil cuando alguien llama a preguntar por su cuenta.
 */
router.get("/mi-equipo", requiereSesion, async (req, res): Promise<void> => {
  const temporada = temporadaPedida(req);
  const pedido = req.query.equipoId != null ? Number(req.query.equipoId) : null;
  const equipoId = equipoAConsultar(req.quien!, Number.isFinite(pedido) ? pedido : null);

  if (equipoId == null) {
    res.status(400).json({ error: "Indica de qué equipo quieres ver el resumen (?equipoId=)." });
    return;
  }

  const [equipo] = await db.select().from(equiposTable).where(eq(equiposTable.id, equipoId));
  if (!equipo) {
    res.status(404).json({ error: "Equipo no encontrado" });
    return;
  }
  const [ajustes] = await db.select().from(ajustesTable).where(eq(ajustesTable.id, 1));

  // ── Plantilla, con lo de cada jugador en el torneo que se consulta ──
  const jugadores = await db.execute(sql`
    SELECT
      j.id, j.nombre, j.n_carnet, j.carnet_pagado,
      (SELECT COUNT(*)::int FROM planilla pl
         JOIN partidos p ON p.id = pl.partido_id
        WHERE pl.jugador_id = j.id AND ${filtroTemporadaSql("p.temporada", temporada)}) as pj,
      (SELECT COALESCE(SUM(g.cantidad), 0)::int FROM goles g
        WHERE g.jugador_id = j.id AND g.propio = false
          AND ${filtroTemporadaSql("g.temporada", temporada)}) as goles,
      (SELECT COUNT(*)::int FROM tarjetas t
        WHERE t.jugador_id = j.id AND t.tipo = 'amarilla'
          AND ${filtroTemporadaSql("t.temporada", temporada)}) as amarillas,
      (SELECT COUNT(*)::int FROM tarjetas t
        WHERE t.jugador_id = j.id AND t.tipo = 'roja'
          AND ${filtroTemporadaSql("t.temporada", temporada)}) as rojas,
      (SELECT COUNT(*)::int FROM tarjetas t
        WHERE t.jugador_id = j.id AND t.tipo = 'amarilla' AND t.pagada = false
          AND ${filtroTemporadaSql("t.temporada", temporada)}) as amarillas_sin_pagar
    FROM jugadores j
    WHERE j.equipo_id = ${equipoId} AND j.activo = true
    ORDER BY j.n_carnet ASC NULLS LAST, j.nombre
  `);

  // ── Fechas de sanción que todavía no ha cumplido cada jugador ──
  // Mismo criterio que GET /sanciones: una fecha se cumple cuando el equipo
  // juega un partido posterior a la tarjeta y el jugador no aparece en la
  // planilla de ese partido.
  const sanciones = await db.execute(sql`
    SELECT
      t.jugador_id,
      MAX(GREATEST(t.fechas_sancion - (
        SELECT COUNT(*)::int
        FROM partidos pp
        WHERE pp.jugado = true
          AND ${filtroTemporadaSql("pp.temporada", temporada)}
          AND (pp.local_id = ${equipoId} OR pp.visitante_id = ${equipoId})
          AND (
            pp.semana > t.semana
            OR (pp.semana = t.semana AND t.partido_id IS NOT NULL AND pp.id > t.partido_id)
          )
          AND NOT EXISTS (
            SELECT 1 FROM planilla pl
            WHERE pl.partido_id = pp.id AND pl.jugador_id = t.jugador_id
          )
      ), 0))::int as pendientes
    FROM tarjetas t
    JOIN jugadores j ON j.id = t.jugador_id
    WHERE t.fechas_sancion > 0
      AND j.equipo_id = ${equipoId}
      AND ${filtroTemporadaSql("t.temporada", temporada)}
    GROUP BY t.jugador_id
  `);
  const pendientesPorJugador = new Map<number, number>();
  for (const r of sanciones.rows as Record<string, unknown>[]) {
    pendientesPorJugador.set(Number(r.jugador_id), Number(r.pendientes ?? 0));
  }

  const plantilla = (jugadores.rows as Record<string, unknown>[]).map((r) => ({
    jugadorId: Number(r.id),
    nombre: String(r.nombre),
    nCarnet: r.n_carnet == null ? null : Number(r.n_carnet),
    carnetPagado: Boolean(r.carnet_pagado),
    partidosJugados: Number(r.pj ?? 0),
    goles: Number(r.goles ?? 0),
    amarillas: Number(r.amarillas ?? 0),
    rojas: Number(r.rojas ?? 0),
    amarillasSinPagar: Number(r.amarillas_sin_pagar ?? 0),
    fechasPendientes: pendientesPorJugador.get(Number(r.id)) ?? 0,
  }));

  // ── La cuenta con el torneo ──
  const pagos = await db.execute(sql`
    SELECT concepto, COALESCE(SUM(monto), 0)::int as total
    FROM pagos
    WHERE equipo_id = ${equipoId} AND ${filtroTemporadaSql("temporada", temporada)}
    GROUP BY concepto
  `);
  const pagadoPorConcepto = new Map<string, number>();
  for (const r of pagos.rows as Record<string, unknown>[]) {
    pagadoPorConcepto.set(String(r.concepto), Number(r.total ?? 0));
  }
  const pagadoInscripcion = pagadoPorConcepto.get("Inscripcion") ?? 0;

  const amarillasSinPagar = plantilla.reduce((s, j) => s + j.amarillasSinPagar, 0);
  const carnetsSinPagar = plantilla.filter((j) => !j.carnetPagado).length;

  // ── Tarjetas sin pagar, con lo que cuesta cada una ──
  // El valor sale de la tarjeta misma (se le asigna al registrarla, con lo
  // que valía ese día en Ajustes); si esa tarjeta quedó sin valor, se usa el
  // de Ajustes de ahora para no mostrar un pendiente en cero que no es.
  const tarjetasPendientes = await db.execute(sql`
    SELECT t.tipo,
           COUNT(*)::int as cantidad,
           COALESCE(SUM(COALESCE(t.valor, 0)), 0)::int as valor,
           COUNT(*) FILTER (WHERE t.valor IS NULL OR t.valor = 0)::int as sin_valor
    FROM tarjetas t
    JOIN jugadores j ON j.id = t.jugador_id
    WHERE j.equipo_id = ${equipoId}
      AND t.pagada = false
      AND ${filtroTemporadaSql("t.temporada", temporada)}
    GROUP BY t.tipo
  `);
  const pendientePorTipo = new Map<string, { cantidad: number; valor: number }>();
  for (const r of tarjetasPendientes.rows as Record<string, unknown>[]) {
    const tipo = String(r.tipo);
    const sinValor = Number(r.sin_valor ?? 0);
    const precioHoy = tipo === "roja" ? (ajustes?.valorRoja ?? 0) : (ajustes?.valorAmarilla ?? 0);
    pendientePorTipo.set(tipo, {
      cantidad: Number(r.cantidad ?? 0),
      valor: Number(r.valor ?? 0) + sinValor * precioHoy,
    });
  }
  const amarillasPend = pendientePorTipo.get("amarilla") ?? { cantidad: 0, valor: 0 };
  const rojasPend = pendientePorTipo.get("roja") ?? { cantidad: 0, valor: 0 };

  /**
   * El detalle concepto por concepto, que es lo que el delegado quiere ver:
   * cuánto lleva pagado y cuánto le falta de cada cosa.
   *
   * Solo cuatro conceptos tienen un pendiente que el sistema pueda saber
   * (inscripción, tarjetas y carnés): ahí hay una deuda registrada contra la
   * cual comparar. Multas, FOFI, traspasos, arbitraje y cintas se registran
   * cuando se pagan, así que de esos solo se puede mostrar lo pagado —
   * `pendiente: null` es justamente "esto no se lleva como deuda", distinto
   * de "debe cero".
   */
  const conceptos = [
    {
      concepto: "Inscripcion",
      etiqueta: "Inscripción",
      pagado: pagadoInscripcion,
      pendiente: Math.max(0, equipo.deudaInscripcion - pagadoInscripcion),
      cantidadPendiente: null as number | null,
    },
    {
      concepto: "Amarillas",
      etiqueta: "Tarjetas amarillas",
      pagado: pagadoPorConcepto.get("Amarillas") ?? 0,
      pendiente: amarillasPend.valor,
      cantidadPendiente: amarillasPend.cantidad,
    },
    {
      concepto: "Rojas",
      etiqueta: "Tarjetas rojas",
      pagado: pagadoPorConcepto.get("Rojas") ?? 0,
      pendiente: rojasPend.valor,
      cantidadPendiente: rojasPend.cantidad,
    },
    {
      concepto: "Carnet",
      etiqueta: "Carnés",
      pagado: pagadoPorConcepto.get("Carnet") ?? 0,
      pendiente: carnetsSinPagar * (ajustes?.valorCarnet ?? 0),
      cantidadPendiente: carnetsSinPagar,
    },
    { concepto: "Multas", etiqueta: "Multas", pagado: pagadoPorConcepto.get("Multas") ?? 0, pendiente: null, cantidadPendiente: null },
    { concepto: "FOFI", etiqueta: "FOFI", pagado: pagadoPorConcepto.get("FOFI") ?? 0, pendiente: null, cantidadPendiente: null },
    { concepto: "Traspaso", etiqueta: "Traspasos", pagado: pagadoPorConcepto.get("Traspaso") ?? 0, pendiente: null, cantidadPendiente: null },
    { concepto: "Mesa", etiqueta: "Arbitraje (mesa)", pagado: pagadoPorConcepto.get("Mesa") ?? 0, pendiente: null, cantidadPendiente: null },
    {
      concepto: "Cinta de capitán",
      etiqueta: "Cintas de capitán",
      pagado: pagadoPorConcepto.get("Cinta de capitán") ?? 0,
      pendiente: null,
      cantidadPendiente: null,
    },
  ];

  const cuenta = {
    deudaInscripcion: equipo.deudaInscripcion,
    pagadoInscripcion,
    saldoInscripcion: equipo.deudaInscripcion - pagadoInscripcion,
    amarillasSinPagar,
    valorAmarillasSinPagar: amarillasSinPagar * (ajustes?.valorAmarilla ?? 0),
    carnetsSinPagar,
    valorCarnetsSinPagar: carnetsSinPagar * (ajustes?.valorCarnet ?? 0),
    pagadoTotal: [...pagadoPorConcepto.values()].reduce((s, v) => s + v, 0),
    pendienteTotal: conceptos.reduce((s, c) => s + (c.pendiente ?? 0), 0),
    conceptos,
  };

  // ── El próximo partido (el más cercano que todavía no se ha jugado) ──
  const proximos = await db.execute(sql`
    SELECT p.id, p.fecha, p.hora, p.semana, p.fase,
           p.local_id, p.visitante_id,
           l.nombre as local_nombre, v.nombre as visitante_nombre,
           a.nombre as arbitro_nombre
    FROM partidos p
    JOIN equipos l ON l.id = p.local_id
    JOIN equipos v ON v.id = p.visitante_id
    LEFT JOIN arbitros a ON a.id = p.arbitro_id
    WHERE p.jugado = false
      AND (p.local_id = ${equipoId} OR p.visitante_id = ${equipoId})
      AND ${filtroTemporadaSql("p.temporada", temporada)}
    ORDER BY p.fecha ASC NULLS LAST, p.hora ASC NULLS LAST, p.semana ASC
    LIMIT 1
  `);
  const fila = proximos.rows[0] as Record<string, unknown> | undefined;
  const proximoPartido = fila
    ? {
        partidoId: Number(fila.id),
        fecha: (fila.fecha as string | null) ?? null,
        hora: (fila.hora as string | null) ?? null,
        semana: Number(fila.semana),
        fase: (fila.fase as string | null) ?? null,
        rivalNombre:
          Number(fila.local_id) === equipoId ? String(fila.visitante_nombre) : String(fila.local_nombre),
        deLocal: Number(fila.local_id) === equipoId,
        arbitroNombre: (fila.arbitro_nombre as string | null) ?? null,
      }
    : null;

  res.json(
    GetMiEquipoResponse.parse({
      equipo: {
        id: equipo.id,
        nombre: equipo.nombre,
        color: equipo.color,
        delegado: equipo.delegado,
        telefono: equipo.telefono,
      },
      cuenta,
      plantilla,
      proximoPartido,
    }),
  );
});

export default router;
