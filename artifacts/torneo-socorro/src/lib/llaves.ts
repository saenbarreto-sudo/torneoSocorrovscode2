import type { EquipoFixture } from './fixture';

/**
 * Generación de cruces de eliminación directa (octavos, cuartos, semifinal,
 * final...), a partir de una lista de equipos ya clasificados y ordenados
 * por posición (1 = mejor sembrado).
 *
 * Lógica pura (sin React ni llamadas a la API), igual que fixture.ts, para
 * poder razonarla y probarla por separado.
 */

export interface EquipoSembrado extends EquipoFixture {
  /** Posición de la que viene sembrado: 1 = el mejor. Define el cruce y el nombre sugerido de la fase. */
  posicion: number;
}

export interface CruceLlave {
  /** Clave estable para la vista previa y para generar los partidos. */
  clave: string;
  mejor: EquipoSembrado;
  /** null = no le tocó rival (número impar de clasificados): pasa directo a la siguiente ronda. */
  peor: EquipoSembrado | null;
}

/**
 * Empareja por siembra estándar: 1° vs último, 2° vs penúltimo, etc., para
 * que los mejores ubicados no se crucen entre ellos en la primera ronda de
 * la llave. Si el número de clasificados es impar, el que queda sin pareja
 * (el peor sembrado de los que sobran) pasa directo, sin jugar esta ronda.
 */
export function generarLlaves(equipos: EquipoSembrado[]): CruceLlave[] {
  const ordenados = [...equipos].sort((a, b) => a.posicion - b.posicion);
  const cruces: CruceLlave[] = [];
  let i = 0;
  let j = ordenados.length - 1;
  while (i < j) {
    cruces.push({ clave: `${ordenados[i].id}x${ordenados[j].id}`, mejor: ordenados[i], peor: ordenados[j] });
    i++;
    j--;
  }
  if (i === j) {
    cruces.push({ clave: `bye-${ordenados[i].id}`, mejor: ordenados[i], peor: null });
  }
  return cruces;
}

/** Nombre sugerido de la fase según cuántos equipos entran a esta ronda de la llave. */
export function nombreFaseEliminacion(cantidadEquipos: number): string {
  if (cantidadEquipos <= 2) return 'Final';
  if (cantidadEquipos <= 4) return 'Semifinal';
  if (cantidadEquipos <= 8) return 'Cuartos de final';
  if (cantidadEquipos <= 16) return 'Octavos de final';
  return 'Eliminación directa';
}
