import { requireAuth, requireRole } from "./require-auth";

/**
 * Roles que pueden CREAR/EDITAR/ELIMINAR en cada recurso. La lectura (GET)
 * queda abierta (la sección "Público" del sitio no tiene cuenta), pero
 * cualquier escritura exige sesión y el rol correcto — así un Delegado o
 * la sección Pública no pueden crear/editar nada aunque llamen a la API
 * directamente, aunque la interfaz ya les oculte los botones.
 */
export const writeAccess = {
  equipos: requireRole("admin"),
  jugadores: requireRole("admin"),
  partidos: requireRole("admin", "mesa"),
  goles: requireRole("admin", "mesa"),
  tarjetas: requireRole("admin", "mesa"),
  pagos: requireRole("admin", "tesorero"),
  programacion: requireRole("admin", "mesa"),
} as const;

export { requireAuth };
