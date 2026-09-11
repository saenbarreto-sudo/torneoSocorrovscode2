import { pgTable, text, serial, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usuariosTable } from "./usuarios";

/**
 * El registro de actividad del torneo: quién entró, quién creó, editó o
 * borró algo, y qué fue exactamente lo que cambió.
 *
 * Se llena solo, desde un middleware que ve pasar TODAS las peticiones que
 * modifican datos (ver lib/registro-eventos.ts). No se escribe desde cada
 * ruta a mano, justamente para que nada se quede sin registrar cuando se
 * agregue una función nueva.
 *
 * Solo se anotan las acciones que modifican algo (y las entradas al
 * sistema), nunca las consultas: si no, el registro se llenaría de ruido y
 * no serviría para lo que existe — aclarar quién hizo qué.
 */
export const ACCIONES_EVENTO = ["ingreso", "ingreso_fallido", "crear", "editar", "borrar"] as const;
export type AccionEvento = (typeof ACCIONES_EVENTO)[number];

export const eventosTable = pgTable(
  "eventos",
  {
    id: serial("id").primaryKey(),
    // Se pone en NULL si la cuenta se borra, pero el nombre queda guardado
    // aparte: el registro debe seguir diciendo quién fue, aunque esa cuenta
    // ya no exista.
    usuarioId: integer("usuario_id").references(() => usuariosTable.id, { onDelete: "set null" }),
    usuarioNombre: text("usuario_nombre").notNull(),
    accion: text("accion").notNull(),
    // Sobre qué se actuó: 'jugador', 'equipo', 'partido', 'pago'...
    entidad: text("entidad").notNull(),
    entidadId: integer("entidad_id"),
    // La frase ya armada y lista para leer en pantalla.
    descripcion: text("descripcion").notNull(),
    // Qué cambió, campo por campo: [{ campo, antes, despues }]. Nunca
    // guarda contraseñas ni fotos (ver CAMPOS_OCULTOS en el middleware).
    cambios: jsonb("cambios"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // La pantalla siempre pide "lo más reciente primero".
    porFecha: index("eventos_created_at_idx").on(t.createdAt),
  }),
);

export const insertEventoSchema = createInsertSchema(eventosTable).omit({ id: true, createdAt: true });
export type InsertEvento = z.infer<typeof insertEventoSchema>;
export type Evento = typeof eventosTable.$inferSelect;
