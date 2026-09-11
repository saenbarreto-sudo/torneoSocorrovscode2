import { pgTable, text, serial, boolean, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { equiposTable } from "./equipos";
import { arbitrosTable } from "./arbitros";

export const partidosTable = pgTable("partidos", {
  id: serial("id").primaryKey(),
  semana: integer("semana").notNull(),
  fecha: date("fecha", { mode: "string" }),
  hora: text("hora"),
  localId: integer("local_id").notNull().references(() => equiposTable.id),
  visitanteId: integer("visitante_id").notNull().references(() => equiposTable.id),
  golesLocal: integer("goles_local"),
  golesVisitante: integer("goles_visitante"),
  // Definición por penales: solo se llenan cuando un partido de eliminación
  // directa termina empatado y hay que definirlo desde el punto penal. En
  // el resto de los partidos quedan en NULL, y no cuentan como goles para
  // ninguna tabla (goleadores, valla, posiciones) — solo dicen quién pasó.
  penalesLocal: integer("penales_local"),
  penalesVisitante: integer("penales_visitante"),
  jugado: boolean("jugado").notNull().default(false),
  fase: text("fase"),
  // Quién dirige el partido. Referencia a arbitros (ver ese archivo) en vez
  // de texto libre, para que las estadísticas por árbitro sean confiables.
  arbitroId: integer("arbitro_id").references(() => arbitrosTable.id, { onDelete: "set null" }),
  // Oficial de mesa que llenó la planilla del partido.
  mesa: text("mesa"),
  // W.O. (Art. 23 del reglamento): el marcador oficial de un walkover es
  // 6-0. Esos goles cuentan para la tabla de posiciones pero NO deben
  // registrarse goleadores individuales (por eso no hay una tabla "goles"
  // asociada en un partido con walkover=true).
  walkover: boolean("walkover").notNull().default(false),
  walkoverGanadorId: integer("walkover_ganador_id").references(() => equiposTable.id),
  // NULL = torneo actual (lo que se juega ahora). Un valor como "2025-2026"
  // marca un partido importado del historial de una temporada pasada, para
  // que no se mezcle con las tablas en vivo (Posiciones, Goleadores,
  // Partidos, Amonestados), que solo miran los que tienen NULL acá. La
  // ficha del jugador sí los muestra todos, sin este filtro — el historial
  // de carrera abarca todas las temporadas a propósito.
  temporada: text("temporada"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPartidoSchema = createInsertSchema(partidosTable).omit({ id: true, createdAt: true });
export type InsertPartido = z.infer<typeof insertPartidoSchema>;
export type Partido = typeof partidosTable.$inferSelect;
