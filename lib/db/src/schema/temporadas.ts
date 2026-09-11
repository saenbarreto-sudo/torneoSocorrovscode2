import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Los torneos que ya se cerraron. El torneo EN CURSO no tiene fila acá: se
 * reconoce porque sus datos no llevan sello de temporada (`temporada IS
 * NULL` en partidos, goles, tarjetas, pagos, egresos, mesas, programación y
 * fases).
 *
 * Al cerrar un torneo se le pone ese sello a todo lo que estaba en vivo y
 * se anota acá — de ahí en adelante esos datos quedan congelados y la app
 * arranca vacía para el torneo siguiente, sin haber borrado nada.
 *
 * Las temporadas viejas importadas desde los Excel (2021-2022 en adelante)
 * también viven acá, aunque no se hayan "cerrado" desde la app.
 */
export const temporadasTable = pgTable("temporadas", {
  // "2026-2027". Es el mismo texto que queda en la columna `temporada` de
  // todas las tablas selladas, así que es la llave natural.
  nombre: text("nombre").primaryKey(),
  // Cuándo se cerró desde la app. NULL en las temporadas importadas, que
  // nunca pasaron por el cierre.
  cerradaAt: timestamp("cerrada_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTemporadaSchema = createInsertSchema(temporadasTable).omit({ createdAt: true });
export type InsertTemporada = z.infer<typeof insertTemporadaSchema>;
export type Temporada = typeof temporadasTable.$inferSelect;
