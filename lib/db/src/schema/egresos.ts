import { pgTable, text, serial, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Gastos de la organización (no de los equipos): compra de láminas para
 * carnés, préstamo de uniformes, balones, arbitraje, etc. Junto con
 * "pagos" (que son los ingresos), le da al Tesorero el balance completo
 * del torneo. Corresponde a la hoja "Balones" / columna "Egresos" de
 * "Cuenta Carnets" que ya manejaban en Excel.
 */
export const egresosTable = pgTable("egresos", {
  id: serial("id").primaryKey(),
  fecha: date("fecha", { mode: "string" }).notNull(),
  descripcion: text("descripcion").notNull(),
  categoria: text("categoria"), // Ej: "Carnets", "Uniformes", "Balones", "Arbitraje", "Otro"
  valor: integer("valor").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEgresoSchema = createInsertSchema(egresosTable).omit({ id: true, createdAt: true });
export type InsertEgreso = z.infer<typeof insertEgresoSchema>;
export type Egreso = typeof egresosTable.$inferSelect;
