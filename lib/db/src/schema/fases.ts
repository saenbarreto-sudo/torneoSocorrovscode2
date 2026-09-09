import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Catálogo de fases del torneo en curso: qué tipo es cada una, usado para
 * decidir cómo mostrar cada una en Posiciones (tabla de puntos para
 * temporada regular/grupos/liguilla, resultados de llave para eliminación)
 * y si sus partidos cuentan para la valla menos vencida — esa deja de
 * sumar apenas arranca la eliminación directa (Art. reglamento).
 *
 * Se llena sola: "Primera vuelta"/"Segunda vuelta" vienen sembradas de
 * fábrica (ver drizzle seed / migración), y el resto se registra
 * automáticamente cada vez que se guarda una fase nueva desde "Armar fase".
 * `orden` es el momento en que se creó, para que las pestañas de
 * Posiciones salgan en el orden real del torneo en vez de alfabético.
 */
export const TIPOS_FASE = ["temporada_regular", "grupos", "liguilla", "eliminacion"] as const;
export type TipoFase = (typeof TIPOS_FASE)[number];

export const fasesTable = pgTable("fases", {
  nombre: text("nombre").primaryKey(),
  tipo: text("tipo").notNull(), // ver TIPOS_FASE
  orden: serial("orden"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFaseSchema = createInsertSchema(fasesTable).omit({ orden: true, createdAt: true });
export type InsertFase = z.infer<typeof insertFaseSchema>;
export type Fase = typeof fasesTable.$inferSelect;
