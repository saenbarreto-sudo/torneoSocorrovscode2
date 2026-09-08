import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Los valores en pesos que se usan en todo el torneo: arbitraje, multas de
 * tarjeta, FOFI, traspasos y la multa por deudas de torneos anteriores.
 * Es una tabla "singleton": siempre hay una sola fila (id=1). Al cambiar un
 * valor acá, lo que se calcula a partir de él (como el valor de una tarjeta
 * nueva) usa el valor nuevo desde ese momento — no cambia lo que ya estaba
 * guardado antes.
 */
export const ajustesTable = pgTable("ajustes", {
  id: serial("id").primaryKey(),
  valorArbitraje: integer("valor_arbitraje").notNull().default(0),
  valorAmarilla: integer("valor_amarilla").notNull().default(0),
  valorRoja: integer("valor_roja").notNull().default(0),
  valorFofi: integer("valor_fofi").notNull().default(0),
  // Multa por deudas que un jugador o equipo arrastra de temporadas
  // anteriores (no se aplica sola: la usa quien registra el pago).
  valorMultaTorneosAnteriores: integer("valor_multa_torneos_anteriores").notNull().default(0),
  valorTraspaso: integer("valor_traspaso").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const updateAjustesSchema = createInsertSchema(ajustesTable).omit({ id: true, updatedAt: true }).partial();
export type UpdateAjustes = z.infer<typeof updateAjustesSchema>;
export type Ajustes = typeof ajustesTable.$inferSelect;
