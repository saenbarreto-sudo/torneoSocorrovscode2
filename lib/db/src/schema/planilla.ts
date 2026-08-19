import { pgTable, serial, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partidosTable } from "./partidos";
import { jugadoresTable } from "./jugadores";

/**
 * Planilla del partido: qué jugadores estuvieron en cada encuentro.
 * Replica la hoja física que llena la mesa, con titulares y suplentes.
 *
 * Es la fuente de verdad de "partidos jugados" por jugador, que a su vez
 * determina si un jugador está activo y cómo se descuentan las fechas de
 * sanción. Los goles y tarjetas siguen viviendo en sus propias tablas
 * ("goles" y "tarjetas"), y se sincronizan al guardar la planilla.
 *
 * El dorsal se guarda por partido, no en la ficha del jugador, porque el
 * número de camiseta puede cambiar de un encuentro a otro.
 */
export const planillaTable = pgTable(
  "planilla",
  {
    id: serial("id").primaryKey(),
    partidoId: integer("partido_id")
      .notNull()
      .references(() => partidosTable.id, { onDelete: "cascade" }),
    jugadorId: integer("jugador_id")
      .notNull()
      .references(() => jugadoresTable.id, { onDelete: "cascade" }),
    dorsal: integer("dorsal"),
    titular: boolean("titular").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Un jugador solo puede aparecer una vez en la planilla de un partido.
    unicoPorPartido: unique("planilla_partido_jugador_unico").on(t.partidoId, t.jugadorId),
  }),
);

export const insertPlanillaSchema = createInsertSchema(planillaTable).omit({ id: true, createdAt: true });
export type InsertPlanilla = z.infer<typeof insertPlanillaSchema>;
export type Planilla = typeof planillaTable.$inferSelect;
