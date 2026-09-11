import { pgTable, text, serial, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * La "mesa" es la caja de un día de juego: la plata que los equipos pagan
 * ese día por el arbitraje (más lo que entre por cintas de capitán) y, de
 * ahí mismo, lo que se paga al árbitro, la cal, los balones y la ayuda a
 * los trabajadores. Lo que sobra pasa a la caja del torneo.
 *
 * Esta tabla es solo la "carátula" de cada día: el nombre, la fecha y si ya
 * se cuadró. La plata en sí NO vive acá — cada ingreso es una fila de
 * "pagos" y cada gasto una de "egresos", ambas con mesa_id apuntando aquí.
 * Así la mesa entra sola al saldo de Tesorería y, si un equipo no paga,
 * queda de una vez como deuda en su estado de cuenta, sin tener que
 * registrarlo dos veces ni sumar cajas aparte.
 */
export const ESTADOS_MESA = ["abierta", "cerrada"] as const;
export type EstadoMesa = (typeof ESTADOS_MESA)[number];

export const mesasTable = pgTable("mesas", {
  id: serial("id").primaryKey(),
  // El día de juego que cuadra esta mesa. Único: una sola mesa por fecha.
  fecha: date("fecha", { mode: "string" }).notNull().unique(),
  nombre: text("nombre"),
  estado: text("estado").notNull().default("abierta"),
  observaciones: text("observaciones"),
  cerradaAt: timestamp("cerrada_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMesaSchema = createInsertSchema(mesasTable).omit({ id: true, createdAt: true });
export type InsertMesa = z.infer<typeof insertMesaSchema>;
export type Mesa = typeof mesasTable.$inferSelect;
