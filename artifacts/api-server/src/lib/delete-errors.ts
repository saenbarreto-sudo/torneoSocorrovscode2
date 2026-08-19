/**
 * Convierte el error de Postgres cuando un DELETE choca con una llave
 * foránea (código 23503) en un mensaje claro para el usuario, en vez de
 * dejar pasar el error crudo de la base de datos. Se usa en todas las
 * rutas que borran un registro que otros pueden estar referenciando
 * (p. ej. borrar una tarjeta que ya tiene un pago asociado).
 */

interface PgError {
  code?: string;
  table?: string;
  constraint?: string;
  detail?: string;
}

function isPgError(err: unknown): err is PgError {
  return typeof err === "object" && err !== null && "code" in err;
}

// Traduce el nombre de la tabla que está bloqueando el borrado a algo
// legible, y da una pista de qué hacer primero.
const DEPENDENT_TABLE_LABELS: Record<string, { label: string; hint: string }> = {
  pagos: { label: "un pago registrado", hint: "Elimina primero ese pago" },
  goles: { label: "goles registrados", hint: "Elimina primero esos goles" },
  tarjetas: { label: "tarjetas registradas", hint: "Elimina primero esas tarjetas" },
  jugadores: { label: "jugadores registrados", hint: "Elimina o reasigna primero esos jugadores" },
  partidos: { label: "partidos programados", hint: "Elimina primero esos partidos" },
  usuarios: { label: "un usuario de delegado asignado", hint: "Reasigna o elimina primero ese usuario" },
};

/**
 * Si `err` es una violación de llave foránea, responde con un 409 y un
 * mensaje entendible. Si no lo es, deja que el error siga su curso normal
 * (el llamador debe re-lanzarlo o dejar que el manejador global lo tome).
 * Devuelve `true` si ya respondió, `false` si no era este tipo de error.
 */
export function respondIfDeleteBlocked(
  err: unknown,
  res: { status: (code: number) => { json: (body: unknown) => void } },
  entityLabel: string,
): boolean {
  if (!isPgError(err) || err.code !== "23503") {
    return false;
  }

  // La tabla que está referenciando este registro suele venir en el
  // "detail" de Postgres, ej: 'Key (id)=(5) is still referenced from table "pagos".'
  const match = err.detail?.match(/referenced from table "(\w+)"/);
  const dependentTable = match?.[1];
  const info = dependentTable ? DEPENDENT_TABLE_LABELS[dependentTable] : undefined;

  const message = info
    ? `No se puede eliminar ${entityLabel} porque tiene ${info.label} asociados. ${info.hint} para poder eliminarlo.`
    : `No se puede eliminar ${entityLabel} porque otros registros dependen de él. Elimina primero esos registros relacionados.`;

  res.status(409).json({ error: message });
  return true;
}
