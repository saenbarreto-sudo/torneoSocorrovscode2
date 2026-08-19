import { pgTable, text, serial, boolean, timestamp, real, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const equiposTable = pgTable("equipos", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
  delegado: text("delegado"),
  // Delegado suplente: respaldo para cuando el principal no puede asistir.
  delegado2: text("delegado2"),
  telefono: text("telefono"),
  color: text("color"),
  activo: boolean("activo").notNull().default(true),
  // Puntos de bonificación para la segunda vuelta (Art. 19 del reglamento).
  // Solo aplica a los 4 equipos que avanzan a la liguilla de clasificación:
  // 1° = 1, 2° = 0.75, 3° = 0.50, 4° = 0.25. Se usa como criterio de
  // desempate en la tabla de posiciones, no se suma a los puntos de partido.
  puntosBonificacion: real("puntos_bonificacion").notNull().default(0),
  // Valor total de la inscripción de la temporada, en pesos. Se usa para
  // calcular cuánto le falta pagar al equipo (deuda - suma de pagos con
  // concepto "Inscripcion"), como lo lleva Olga en su hoja de cuotas.
  // 1.000.000 es el valor por defecto actual del torneo.
  deudaInscripcion: integer("deuda_inscripcion").notNull().default(1000000),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEquipoSchema = createInsertSchema(equiposTable).omit({ id: true, createdAt: true });
export type InsertEquipo = z.infer<typeof insertEquipoSchema>;
export type Equipo = typeof equiposTable.$inferSelect;
