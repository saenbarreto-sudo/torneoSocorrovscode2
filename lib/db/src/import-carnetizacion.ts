/**
 * Completa la ficha de los jugadores con los datos que faltaban del Excel
 * "Base de Datos Carné 2026", que ya están depurados en
 * src/data/carnetizacion-2026.json.
 *
 * Uso:  pnpm db:import-carnetizacion
 *
 * Qué llena:
 *  - Fecha de la foto (hoja "BD_Carnet 2025 - 2026").
 *  - Carnetización: fecha de pago, valor, fecha de entrega y quién lo recibió
 *    (hoja "BD_Carnet 2021", que es donde quedó registrada).
 *  - El equipo de la temporada anterior (hoja "BD_Carnet 2024 - 2025"), que
 *    se guarda en jugador_equipo_historial y es lo que alimenta el
 *    "Último equipo anterior" y la "Trayectoria por equipo" de la ficha.
 *
 * Es idempotente: se puede correr las veces que haga falta. No borra nada ni
 * toca jugadores que no aparezcan en el archivo, y solo escribe el historial
 * de quien todavía no lo tenga.
 *
 * Los jugadores se cruzan por cédula. Las columnas de la categoría 50 se
 * ignoran a propósito: esa categoría no aplica al torneo.
 */
import "./load-env-import";
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "./index";
import { equiposTable, jugadoresTable, jugadorEquipoHistorialTable } from "./schema";

interface FilaCarnet {
  cedula: string;
  fechaFoto?: string;
  equipoAnterior?: string;
  carnetPagado?: boolean;
  carnetFechaPago?: string;
  carnetValor?: number;
  carnetFechaEntrega?: string;
  carnetQuienRecibio?: string;
}

/**
 * Ventanas de tiempo del historial. El torneo va por temporadas, así que basta
 * con separar "la temporada anterior" de "la actual"; las fechas exactas de
 * traspaso no están en el Excel.
 */
const INICIO_TEMPORADA_ANTERIOR = "2024-01-01";
const FIN_TEMPORADA_ANTERIOR = "2025-12-31";
const INICIO_TEMPORADA_ACTUAL = "2026-01-01";
/** Igual que HISTORIAL_SENTINEL_FECHA en el backend: "desde siempre". */
const SIN_FECHA_CONOCIDA = "2000-01-01";

/** Compara nombres de equipo ignorando tildes, mayúsculas y espacios de más. */
const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const soloDigitos = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "");

async function main() {
  const ruta = path.resolve(import.meta.dirname, "./data/carnetizacion-2026.json");
  const { jugadores: filas, _descartes } = JSON.parse(readFileSync(ruta, "utf-8")) as {
    jugadores: FilaCarnet[];
    _descartes?: string[];
  };

  console.log(`Archivo leído: ${filas.length} jugadores con datos del Excel.`);
  if (_descartes?.length) {
    console.log("\nDatos descartados por venir mal en el Excel:");
    for (const d of _descartes) console.log(`  - ${d}`);
  }

  const resumen = {
    fichasActualizadas: 0,
    sinCoincidencia: 0,
    historialCreado: 0,
    historialYaExistia: 0,
    equipoAnteriorDesconocido: new Set<string>(),
  };

  await db.transaction(async (tx) => {
    const jugadoresBD = await tx
      .select({ id: jugadoresTable.id, cedula: jugadoresTable.cedula, equipoId: jugadoresTable.equipoId })
      .from(jugadoresTable);
    const porCedula = new Map(jugadoresBD.map((j) => [soloDigitos(j.cedula), j]));

    const equipos = await tx.select({ id: equiposTable.id, nombre: equiposTable.nombre }).from(equiposTable);
    const equipoPorNombre = new Map(equipos.map((e) => [normalizar(e.nombre), e.id]));

    // Quién ya tiene historial: a esos no se les toca, para no pisar traspasos
    // registrados a mano desde la aplicación.
    const conHistorial = new Set(
      (
        await tx
          .select({ jugadorId: jugadorEquipoHistorialTable.jugadorId })
          .from(jugadorEquipoHistorialTable)
      ).map((h) => h.jugadorId),
    );

    console.log("\nActualizando fichas...");
    for (const fila of filas) {
      const jugador = porCedula.get(soloDigitos(fila.cedula));
      if (!jugador) {
        resumen.sinCoincidencia++;
        continue;
      }

      // Solo se escriben las columnas que el Excel realmente trae, para no
      // borrar con null lo que alguien haya llenado ya desde la aplicación.
      const cambios: Record<string, unknown> = {};
      if (fila.fechaFoto) cambios.fechaFoto = fila.fechaFoto;
      if (fila.carnetFechaPago) cambios.carnetFechaPago = fila.carnetFechaPago;
      if (fila.carnetValor != null) cambios.carnetValor = fila.carnetValor;
      if (fila.carnetFechaEntrega) cambios.carnetFechaEntrega = fila.carnetFechaEntrega;
      if (fila.carnetQuienRecibio) cambios.carnetQuienRecibio = fila.carnetQuienRecibio;
      if (fila.carnetPagado) cambios.carnetPagado = true;

      if (Object.keys(cambios).length > 0) {
        await tx.update(jugadoresTable).set(cambios).where(eq(jugadoresTable.id, jugador.id));
        resumen.fichasActualizadas++;
      }

      if (conHistorial.has(jugador.id)) {
        resumen.historialYaExistia++;
        continue;
      }

      const idAnterior = fila.equipoAnterior ? equipoPorNombre.get(normalizar(fila.equipoAnterior)) : undefined;
      if (fila.equipoAnterior && idAnterior === undefined) {
        resumen.equipoAnteriorDesconocido.add(fila.equipoAnterior);
      }

      if (idAnterior !== undefined && idAnterior !== jugador.equipoId) {
        // Cambió de equipo: una etapa cerrada en el anterior y otra abierta
        // en el actual.
        await tx.insert(jugadorEquipoHistorialTable).values([
          {
            jugadorId: jugador.id,
            equipoId: idAnterior,
            fechaInicio: INICIO_TEMPORADA_ANTERIOR,
            fechaFin: FIN_TEMPORADA_ANTERIOR,
          },
          {
            jugadorId: jugador.id,
            equipoId: jugador.equipoId,
            fechaInicio: INICIO_TEMPORADA_ACTUAL,
            fechaFin: null,
          },
        ]);
      } else {
        // Sigue en el mismo equipo (o no se sabe de dónde venía): una sola
        // etapa abierta.
        await tx.insert(jugadorEquipoHistorialTable).values({
          jugadorId: jugador.id,
          equipoId: jugador.equipoId,
          fechaInicio: idAnterior !== undefined ? INICIO_TEMPORADA_ANTERIOR : SIN_FECHA_CONOCIDA,
          fechaFin: null,
        });
      }
      resumen.historialCreado++;
      conHistorial.add(jugador.id);
    }

    // Los que no salen en el Excel también necesitan su etapa abierta, si no
    // la ficha les muestra la trayectoria vacía.
    const faltantes = await tx.execute(sql`
      SELECT j.id, j.equipo_id
      FROM jugadores j
      LEFT JOIN jugador_equipo_historial h ON h.jugador_id = j.id
      WHERE h.id IS NULL
    `);
    if (faltantes.rows.length > 0) {
      await tx.insert(jugadorEquipoHistorialTable).values(
        faltantes.rows.map((r) => ({
          jugadorId: Number(r.id),
          equipoId: Number(r.equipo_id),
          fechaInicio: SIN_FECHA_CONOCIDA,
          fechaFin: null,
        })),
      );
      resumen.historialCreado += faltantes.rows.length;
    }
  });

  console.log("\n── Resultado ──");
  console.log(`  Fichas actualizadas:              ${resumen.fichasActualizadas}`);
  console.log(`  Cédulas del Excel sin jugador:    ${resumen.sinCoincidencia}`);
  console.log(`  Historiales creados:              ${resumen.historialCreado}`);
  console.log(`  Jugadores que ya tenían historial: ${resumen.historialYaExistia} (no se tocaron)`);
  if (resumen.equipoAnteriorDesconocido.size > 0) {
    console.log(`  Equipos anteriores desconocidos:  ${[...resumen.equipoAnteriorDesconocido].join(", ")}`);
  }
  console.log("\nListo.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
