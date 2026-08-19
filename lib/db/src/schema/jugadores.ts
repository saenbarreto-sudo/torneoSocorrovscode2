import { pgTable, text, serial, boolean, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { equiposTable } from "./equipos";

export const jugadoresTable = pgTable("jugadores", {
  id: serial("id").primaryKey(),
  cedula: text("cedula").unique(),
  nombre: text("nombre").notNull(),
  fechaNacimiento: date("fecha_nacimiento", { mode: "string" }),
  equipoId: integer("equipo_id").notNull().references(() => equiposTable.id),
  nCarnet: integer("n_carnet"),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertJugadorSchema = createInsertSchema(jugadoresTable).omit({ id: true, createdAt: true });
export type InsertJugador = z.infer<typeof insertJugadorSchema>;
export type Jugador = typeof jugadoresTable.$inferSelect;
