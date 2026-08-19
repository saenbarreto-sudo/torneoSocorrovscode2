import { pgTable, text, serial, boolean, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jugadoresTable } from "./jugadores";
import { partidosTable } from "./partidos";

export const tarjetasTable = pgTable("tarjetas", {
  id: serial("id").primaryKey(),
  jugadorId: integer("jugador_id").notNull().references(() => jugadoresTable.id),
  tipo: text("tipo").notNull(), // 'amarilla' | 'roja'
  semana: integer("semana").notNull(),
  fecha: date("fecha", { mode: "string" }),
  partidoId: integer("partido_id").references(() => partidosTable.id),
  valor: integer("valor"),
  pagada: boolean("pagada").notNull().default(false),
  // Texto libre con el detalle de la sanción (se conserva para notas).
  sancion: text("sancion"),
  // Número de fechas de suspensión. Es lo que permite ir descontando
  // automáticamente a medida que el equipo del jugador juega y él no
  // aparece en la planilla.
  fechasSancion: integer("fechas_sancion").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTarjetaSchema = createInsertSchema(tarjetasTable).omit({ id: true, createdAt: true });
export type InsertTarjeta = z.infer<typeof insertTarjetaSchema>;
export type Tarjeta = typeof tarjetasTable.$inferSelect;
