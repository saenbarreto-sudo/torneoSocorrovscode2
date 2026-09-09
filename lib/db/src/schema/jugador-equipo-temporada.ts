import { pgTable, integer, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jugadoresTable } from "./jugadores";
import { equiposTable } from "./equipos";

/**
 * A qué equipo perteneció un jugador en cada temporada IMPORTADA del
 * historial (ver schema/partidos.ts). Existe aparte de
 * jugador_equipo_historial porque ese usa rangos de fecha, y las fechas
 * reales de una temporada y la siguiente a veces se traslapan un poco en
 * los Excel de origen (ej. la 2022-2023 sigue hasta julio 2023 mientras la
 * 2023-2024 ya arrancó en febrero) — con fechas, un partido podía quedar
 * atribuido al equipo equivocado. Acá no hay ambigüedad: la temporada es
 * el dato exacto que ya viene en cada partido/gol/tarjeta importado.
 *
 * Solo cubre temporadas pasadas ya importadas; el torneo en curso
 * (temporada NULL) sigue usando jugador_equipo_historial, porque ahí sí
 * puede haber un traspaso a mitad de la temporada que solo una fecha
 * exacta puede resolver.
 */
export const jugadorEquipoTemporadaTable = pgTable(
  "jugador_equipo_temporada",
  {
    jugadorId: integer("jugador_id").notNull().references(() => jugadoresTable.id, { onDelete: "cascade" }),
    temporada: text("temporada").notNull(),
    equipoId: integer("equipo_id").notNull().references(() => equiposTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.jugadorId, t.temporada] })],
);

export const insertJugadorEquipoTemporadaSchema = createInsertSchema(jugadorEquipoTemporadaTable).omit({ createdAt: true });
export type InsertJugadorEquipoTemporada = z.infer<typeof insertJugadorEquipoTemporadaSchema>;
export type JugadorEquipoTemporada = typeof jugadorEquipoTemporadaTable.$inferSelect;
