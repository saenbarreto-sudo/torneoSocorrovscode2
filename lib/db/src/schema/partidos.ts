import { pgTable, text, serial, boolean, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { equiposTable } from "./equipos";

export const partidosTable = pgTable("partidos", {
  id: serial("id").primaryKey(),
  semana: integer("semana").notNull(),
  fecha: date("fecha", { mode: "string" }),
  hora: text("hora"),
  localId: integer("local_id").notNull().references(() => equiposTable.id),
  visitanteId: integer("visitante_id").notNull().references(() => equiposTable.id),
  golesLocal: integer("goles_local"),
  golesVisitante: integer("goles_visitante"),
  jugado: boolean("jugado").notNull().default(false),
  fase: text("fase"),
  arbitro: text("arbitro"),
  // Oficial de mesa que llenó la planilla del partido.
  mesa: text("mesa"),
  // W.O. (Art. 23 del reglamento): el marcador oficial de un walkover es
  // 6-0. Esos goles cuentan para la tabla de posiciones pero NO deben
  // registrarse goleadores individuales (por eso no hay una tabla "goles"
  // asociada en un partido con walkover=true).
  walkover: boolean("walkover").notNull().default(false),
  walkoverGanadorId: integer("walkover_ganador_id").references(() => equiposTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPartidoSchema = createInsertSchema(partidosTable).omit({ id: true, createdAt: true });
export type InsertPartido = z.infer<typeof insertPartidoSchema>;
export type Partido = typeof partidosTable.$inferSelect;
