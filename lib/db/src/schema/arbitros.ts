import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * El árbitro como registro propio, no como texto suelto.
 *
 * Antes "Aníbal Bolívar" se escribía a mano en cada partido y otra vez en
 * cada pago de la mesa — nada garantizaba que quedara igual las dos veces.
 * Con esto, cada árbitro es siempre la misma fila, así que sus estadísticas
 * (partidos dirigidos, tarjetas en sus partidos, lo que se le ha pagado)
 * se pueden sumar de verdad.
 *
 * No lleva "temporada": el árbitro es una persona, igual que un jugador —
 * sigue existiendo entre un torneo y el siguiente. Lo que sí queda fijado
 * por temporada es cada partido que dirigió (partidos.temporada).
 */
export const arbitrosTable = pgTable("arbitros", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  telefono: text("telefono"),
  // Data URL (base64), igual que la foto de carné del jugador: el volumen
  // de un torneo local es pequeño y evita montar almacenamiento aparte.
  foto: text("foto"),
  // Como con equipos/jugadores: cuando alguien deja de arbitrar se marca
  // inactivo (no aparece para asignarlo a partidos nuevos) sin perder su
  // historial ni sus estadísticas.
  activo: boolean("activo").notNull().default(true),
  notas: text("notas"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertArbitroSchema = createInsertSchema(arbitrosTable).omit({ id: true, createdAt: true });
export type InsertArbitro = z.infer<typeof insertArbitroSchema>;
export type Arbitro = typeof arbitrosTable.$inferSelect;
