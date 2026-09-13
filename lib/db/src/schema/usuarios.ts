import { pgTable, text, serial, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { equiposTable } from "./equipos";

/**
 * Roles de acceso al sistema. "publico" no tiene cuenta de usuario (entra
 * sin credenciales, solo consulta) por eso no aparece en la tabla usuarios.
 *
 * "superadmin" (Administrador del sistema) está POR ENCIMA del Comité: hace
 * todo lo que hace un admin, y además es el único que ve el registro de
 * Actividad — que es justamente el control de lo que hace el Comité — y el
 * único que puede repartir ese rol. Si cualquier admin pudiera asignárselo,
 * el control no serviría de nada.
 */
export const ROLES_USUARIO = ["superadmin", "admin", "delegado"] as const;
export type RolUsuario = (typeof ROLES_USUARIO)[number];

export const usuariosTable = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  nombre: text("nombre").notNull(),
  rol: text("rol").notNull(), // admin | delegado
  // Solo aplica para el rol "delegado": a qué equipo pertenece.
  equipoId: integer("equipo_id").references(() => equiposTable.id),
  activo: boolean("activo").notNull().default(true),
  // El Comite crea la cuenta con una contrasena TEMPORAL y se la pasa al
  // delegado; con esta marca en true, al entrar lo primero que ve es la
  // pantalla de ponerse una propia, y hasta que no lo haga el servidor no le
  // deja hacer nada mas. Asi la contrasena del delegado es solo suya: quien
  // creo la cuenta no la conoce, y si manana hay un reclamo de "alguien
  // entro con mi usuario" la respuesta es clara.
  debeCambiarPassword: boolean("debe_cambiar_password").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUsuarioSchema = createInsertSchema(usuariosTable)
  .omit({ id: true, createdAt: true, passwordHash: true })
  .extend({ password: z.string().min(8) });
export type InsertUsuario = z.infer<typeof insertUsuarioSchema>;
export type Usuario = typeof usuariosTable.$inferSelect;
