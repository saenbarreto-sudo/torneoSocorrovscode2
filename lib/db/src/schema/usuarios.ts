import { pgTable, text, serial, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { equiposTable } from "./equipos";

/**
 * Roles de acceso al sistema. "publico" no tiene cuenta de usuario (entra
 * sin credenciales, solo consulta) por eso no aparece en la tabla usuarios.
 */
export const ROLES_USUARIO = ["admin", "tesorero", "mesa", "delegado", "carnets"] as const;
export type RolUsuario = (typeof ROLES_USUARIO)[number];

export const usuariosTable = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  nombre: text("nombre").notNull(),
  rol: text("rol").notNull(), // admin | tesorero | mesa | delegado | carnets
  // Solo aplica para el rol "delegado": a qué equipo pertenece.
  equipoId: integer("equipo_id").references(() => equiposTable.id),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUsuarioSchema = createInsertSchema(usuariosTable)
  .omit({ id: true, createdAt: true, passwordHash: true })
  .extend({ password: z.string().min(4) });
export type InsertUsuario = z.infer<typeof insertUsuarioSchema>;
export type Usuario = typeof usuariosTable.$inferSelect;
