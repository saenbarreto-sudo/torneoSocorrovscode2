import { pgTable, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Los valores en pesos que se usan en todo el torneo: arbitraje, multas de
 * tarjeta, FOFI, traspasos y la multa por deudas de torneos anteriores.
 * Es una tabla "singleton": siempre hay una sola fila (id=1). Al cambiar un
 * valor acá, lo que se calcula a partir de él (como el valor de una tarjeta
 * nueva) usa el valor nuevo desde ese momento — no cambia lo que ya estaba
 * guardado antes.
 *
 * El arbitraje se paga distinto según la fase del torneo (Art. reglamento):
 * la mayoría de las fases siempre llevan 1 árbitro, pero semifinal liguilla,
 * semifinal del torneo y la final del torneo pueden pagarse con 1 árbitro O
 * con terna (3 árbitros) — se decide más cerca de la fecha, por eso esas
 * tres traen los dos valores y una casilla para marcar cuál aplica.
 */
export const ajustesTable = pgTable("ajustes", {
  id: serial("id").primaryKey(),
  // Fases que siempre se pagan con 1 árbitro.
  valorArbitrajePrimeraVuelta: integer("valor_arbitraje_primera_vuelta").notNull().default(0),
  valorArbitrajeSegundaVuelta: integer("valor_arbitraje_segunda_vuelta").notNull().default(0),
  valorArbitrajeSemifinal: integer("valor_arbitraje_semifinal").notNull().default(0),
  valorArbitrajeMuerteSubita: integer("valor_arbitraje_muerte_subita").notNull().default(0),
  valorArbitrajeFinalLiguilla: integer("valor_arbitraje_final_liguilla").notNull().default(0),
  // Fases que pueden ser 1 árbitro o terna: los dos valores + la casilla
  // que dice cuál de los dos se está pagando.
  valorArbitrajeSemifinalLiguilla: integer("valor_arbitraje_semifinal_liguilla").notNull().default(0),
  valorTernaSemifinalLiguilla: integer("valor_terna_semifinal_liguilla").notNull().default(0),
  ternaSemifinalLiguilla: boolean("terna_semifinal_liguilla").notNull().default(false),
  valorArbitrajeSemifinalTorneo: integer("valor_arbitraje_semifinal_torneo").notNull().default(0),
  valorTernaSemifinalTorneo: integer("valor_terna_semifinal_torneo").notNull().default(0),
  ternaSemifinalTorneo: boolean("terna_semifinal_torneo").notNull().default(false),
  valorArbitrajeFinalTorneo: integer("valor_arbitraje_final_torneo").notNull().default(0),
  valorTernaFinalTorneo: integer("valor_terna_final_torneo").notNull().default(0),
  ternaFinalTorneo: boolean("terna_final_torneo").notNull().default(false),
  valorAmarilla: integer("valor_amarilla").notNull().default(0),
  valorRoja: integer("valor_roja").notNull().default(0),
  valorFofi: integer("valor_fofi").notNull().default(0),
  valorCarnet: integer("valor_carnet").notNull().default(0),
  // Multa por deudas que un jugador o equipo arrastra de temporadas
  // anteriores (no se aplica sola: la usa quien registra el pago).
  valorMultaTorneosAnteriores: integer("valor_multa_torneos_anteriores").notNull().default(0),
  valorTraspaso: integer("valor_traspaso").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const updateAjustesSchema = createInsertSchema(ajustesTable).omit({ id: true, updatedAt: true }).partial();
export type UpdateAjustes = z.infer<typeof updateAjustesSchema>;
export type Ajustes = typeof ajustesTable.$inferSelect;
