import { pgTable, serial, integer, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jugadoresTable } from "./jugadores";
import { equiposTable } from "./equipos";

/**
 * Registra cada paso de un jugador por un equipo, con fecha de inicio y de
 * fin (null = equipo actual). Es lo que permite saber "el último equipo
 * donde jugó" y atribuir correctamente goles/tarjetas/partidos al equipo
 * que le correspondía en cada fecha, incluso si el jugador se transfirió.
 *
 * Se mantiene sincronizada desde las rutas de jugadores: crear un jugador
 * abre el primer registro, y cambiar su equipoId cierra el registro
 * abierto y abre uno nuevo.
 */
export const jugadorEquipoHistorialTable = pgTable("jugador_equipo_historial", {
  id: serial("id").primaryKey(),
  jugadorId: integer("jugador_id").notNull().references(() => jugadoresTable.id, { onDelete: "cascade" }),
  equipoId: integer("equipo_id").notNull().references(() => equiposTable.id),
  fechaInicio: date("fecha_inicio", { mode: "string" }).notNull(),
  fechaFin: date("fecha_fin", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertJugadorEquipoHistorialSchema = createInsertSchema(jugadorEquipoHistorialTable).omit({ id: true, createdAt: true });
export type InsertJugadorEquipoHistorial = z.infer<typeof insertJugadorEquipoHistorialSchema>;
export type JugadorEquipoHistorial = typeof jugadorEquipoHistorialTable.$inferSelect;
