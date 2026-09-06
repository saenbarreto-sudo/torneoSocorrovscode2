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
  // Data URL (base64) de la foto de carnet. Se guarda directo en la fila
  // porque el volumen de fotos de un torneo local es pequeño; evita tener
  // que montar almacenamiento de archivos aparte.
  foto: text("foto"),
  fechaFoto: date("fecha_foto", { mode: "string" }),
  // --- Carnetización ---
  carnetPagado: boolean("carnet_pagado").notNull().default(false),
  carnetValor: integer("carnet_valor"),
  carnetFechaEntrega: date("carnet_fecha_entrega", { mode: "string" }),
  // Quién recibió el carné físico (normalmente el delegado del equipo).
  carnetQuienRecibio: text("carnet_quien_recibio"),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertJugadorSchema = createInsertSchema(jugadoresTable).omit({ id: true, createdAt: true });
export type InsertJugador = z.infer<typeof insertJugadorSchema>;
export type Jugador = typeof jugadoresTable.$inferSelect;
