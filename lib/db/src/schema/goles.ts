import { pgTable, text, serial, boolean, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jugadoresTable } from "./jugadores";
import { partidosTable } from "./partidos";

export const golesTable = pgTable("goles", {
  id: serial("id").primaryKey(),
  jugadorId: integer("jugador_id").notNull().references(() => jugadoresTable.id),
  partidoId: integer("partido_id").references(() => partidosTable.id, { onDelete: "cascade" }),
  semana: integer("semana").notNull(),
  fecha: date("fecha", { mode: "string" }),
  cantidad: integer("cantidad").notNull().default(1),
  propio: boolean("propio").notNull().default(false),
  // Ver el mismo campo en partidos.ts: NULL = torneo actual, un valor tipo
  // "2025-2026" = gol importado del historial de una temporada pasada.
  temporada: text("temporada"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGolSchema = createInsertSchema(golesTable).omit({ id: true, createdAt: true });
export type InsertGol = z.infer<typeof insertGolSchema>;
export type Gol = typeof golesTable.$inferSelect;
