import { pgTable, text, serial, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { equiposTable } from "./equipos";
import { tarjetasTable } from "./tarjetas";

export const pagosTable = pgTable("pagos", {
  id: serial("id").primaryKey(),
  nRecibo: integer("n_recibo"),
  codigoRecibo: text("codigo_recibo"),
  equipoId: integer("equipo_id").notNull().references(() => equiposTable.id),
  concepto: text("concepto").notNull(), // Inscripcion, Multas, Carnet, Rojas, Amarillas, FOFI
  monto: integer("monto").notNull(),
  semana: integer("semana"),
  mes: text("mes"),
  fecha: date("fecha", { mode: "string" }),
  // Si este pago corresponde al pago de una tarjeta amarilla puntual, queda
  // enlazado aquí. Al registrar el pago, esa tarjeta se marca como pagada y
  // desaparece de la lista de amonestados pendientes. Si la tarjeta se
  // borra después, el pago no desaparece con ella (es un registro de plata
  // real) — solo pierde el enlace.
  tarjetaId: integer("tarjeta_id").references(() => tarjetasTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPagoSchema = createInsertSchema(pagosTable).omit({ id: true, createdAt: true });
export type InsertPago = z.infer<typeof insertPagoSchema>;
export type Pago = typeof pagosTable.$inferSelect;
