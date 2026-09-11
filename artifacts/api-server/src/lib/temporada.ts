import { eq, isNull, sql, type Column, type SQL } from "drizzle-orm";
import type { Request } from "express";

/**
 * Qué torneo se está consultando.
 *
 * Todo lo del torneo EN CURSO se reconoce porque no lleva sello de
 * temporada (`temporada IS NULL`); un torneo ya cerrado lleva su nombre
 * ("2025-2026"). Las pantallas piden un torneo viejo mandando
 * `?temporada=2025-2026`; sin ese parámetro, se responde el torneo en
 * curso, que es lo que espera el 99% de la app.
 *
 * Ver schema/temporadas.ts y routes/temporadas.ts (el cierre).
 */

/** El torneo pedido, o null si se está consultando el torneo en curso. */
export function temporadaPedida(req: Request): string | null {
  const valor = req.query?.temporada;
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

/**
 * La condición para SQL crudo: `p.temporada IS NULL` o `p.temporada = '...'`.
 * El nombre de la columna nunca viene del usuario — siempre es un literal
 * escrito acá en el código — por eso puede ir como sql.raw.
 */
export function filtroTemporadaSql(columna: string, temporada: string | null): SQL {
  const col = sql.raw(columna);
  return temporada ? sql`${col} = ${temporada}` : sql`${col} IS NULL`;
}

/** Lo mismo, para las consultas armadas con el constructor de drizzle. */
export function filtroTemporada(columna: Column, temporada: string | null): SQL {
  return temporada ? eq(columna, temporada) : isNull(columna);
}
