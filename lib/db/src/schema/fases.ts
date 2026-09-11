import { pgTable, text, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

/**
 * Catálogo de fases del torneo: qué tipo es cada una, usado para decidir
 * cómo mostrar cada una en Posiciones (tabla de puntos para temporada
 * regular/grupos/liguilla, resultados de llave para eliminación) y si sus
 * partidos cuentan para la valla menos vencida — esa deja de sumar apenas
 * arranca la eliminación directa (Art. reglamento).
 *
 * Se llena sola: "Primera vuelta"/"Segunda vuelta" vienen sembradas de
 * fábrica (ver drizzle seed / migración), y el resto se registra
 * automáticamente cada vez que se guarda una fase nueva desde "Armar fase".
 * `orden` es el momento en que se creó, para que las pestañas de
 * Posiciones salgan en el orden real del torneo en vez de alfabético.
 *
 * `temporada` sigue el mismo criterio que el resto del torneo: NULL = fase
 * del torneo en curso; con valor = fase de un torneo ya cerrado. Por eso el
 * nombre no puede ser la llave primaria (cada torneo vuelve a tener su
 * "Grupo A"): lo único que no se puede repetir es el nombre DENTRO del
 * torneo en curso.
 */
export const TIPOS_FASE = ["temporada_regular", "grupos", "liguilla", "eliminacion"] as const;
export type TipoFase = (typeof TIPOS_FASE)[number];

export const fasesTable = pgTable(
  "fases",
  {
    id: serial("id").primaryKey(),
    nombre: text("nombre").notNull(),
    tipo: text("tipo").notNull(), // ver TIPOS_FASE
    // Sigue siendo serial: el orden en que se creó la fase es el orden real
    // del torneo, y así las pestañas no salen alfabéticas.
    orden: serial("orden"),
    temporada: text("temporada"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Índice parcial: el nombre es único solo entre las fases del torneo en
    // curso. Las de torneos cerrados pueden repetirlo sin problema.
    nombreEnCurso: uniqueIndex("fases_nombre_en_curso_idx")
      .on(t.nombre)
      .where(sql`temporada IS NULL`),
  }),
);

export const insertFaseSchema = createInsertSchema(fasesTable).omit({ id: true, orden: true, createdAt: true });
export type InsertFase = z.infer<typeof insertFaseSchema>;
export type Fase = typeof fasesTable.$inferSelect;
