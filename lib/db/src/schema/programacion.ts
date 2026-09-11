import { pgTable, text, serial, boolean, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const programacionTable = pgTable("programacion", {
  id: serial("id").primaryKey(),
  semana: integer("semana").notNull(),
  nombreSemana: text("nombre_semana"),
  fechaDesde: date("fecha_desde", { mode: "string" }),
  fechaHasta: date("fecha_hasta", { mode: "string" }),
  esFestivo: boolean("es_festivo").notNull().default(false),
  // Sello del torneo al que pertenece: NULL = torneo en curso, un valor
  // tipo "2026-2027" = torneo ya cerrado (ver schema/temporadas.ts). Sin
  // esto, las jornadas del torneo pasado seguirían saliendo en el
  // cronograma del nuevo.
  temporada: text("temporada"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProgramacionSchema = createInsertSchema(programacionTable).omit({ id: true, createdAt: true });
export type InsertProgramacion = z.infer<typeof insertProgramacionSchema>;
export type Programacion = typeof programacionTable.$inferSelect;
