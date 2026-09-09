import type { EquipoSembrado } from './llaves';

/**
 * Reparto de equipos clasificados en grupos, y combinación de varios grupos
 * ya jugados en una sola lista sembrada para armar la siguiente fase (la
 * eliminatoria). Lógica pura, igual que fixture.ts y llaves.ts.
 */

/**
 * Orden serpentina (tipo sorteo de mundial): 1°→A, 2°→B, 3°→C..., y al
 * llegar al último grupo se invierte el sentido en vez de volver a A, para
 * que los grupos queden parejos en nivel en vez de que el Grupo A se lleve
 * siempre a los mejores. Devuelve, para cada posición de la lista original
 * (0 = mejor), el índice del grupo que le toca.
 */
export function ordenSerpentina(cantidadGrupos: number, cantidadEquipos: number): number[] {
  const orden: number[] = [];
  let idx = 0;
  let dir = 1;
  for (let i = 0; i < cantidadEquipos; i++) {
    orden.push(idx);
    const siguiente = idx + dir;
    if (siguiente < 0 || siguiente >= cantidadGrupos) {
      dir = -dir;
    } else {
      idx = siguiente;
    }
  }
  return orden;
}

/** Letra de grupo: 0→A, 1→B, ..., 25→Z. */
export function letraGrupo(indice: number): string {
  return String.fromCharCode(65 + indice);
}

/**
 * Reparte los equipos (ya ordenados por posición, mejor primero) en N
 * grupos por serpentina. Si no reparte exacto, algunos grupos quedan con un
 * equipo más que otros (ej. 10 equipos en 3 grupos → 4-3-3), nunca falla.
 */
export function repartirEnGrupos(equipos: EquipoSembrado[], cantidadGrupos: number): EquipoSembrado[][] {
  const orden = ordenSerpentina(cantidadGrupos, equipos.length);
  const grupos: EquipoSembrado[][] = Array.from({ length: cantidadGrupos }, () => []);
  equipos.forEach((equipo, i) => grupos[orden[i]].push(equipo));
  return grupos;
}

/**
 * Combina los clasificados de varias fases (grupos, o cualquier otro
 * origen) en una sola lista sembrada para armar la eliminatoria siguiente,
 * evitando en lo posible que dos equipos del mismo origen se crucen en la
 * primera ronda.
 *
 * Arma "niveles": todos los 1°s de cada grupo primero (en el mismo orden en
 * que se marcaron los orígenes), después todos los 2°s, etc. Con
 * generarLlaves (que empareja el 1° de la lista contra el último, el 2°
 * contra el anteúltimo...) esto ya evita el choque en el caso más común
 * (2 orígenes, o cualquier cantidad par): el primero y el segundo de un
 * mismo grupo quedan separados por los del resto de grupos entre ellos, en
 * vez de terminar juntos en los dos extremos. Con una cantidad impar de
 * orígenes puede quedar algún choque igual — para eso está el aviso en la
 * pantalla, no hay forma de garantizarlo siempre.
 */
export function combinarClasificadosDeVariosOrigenes(
  origenes: Array<{ fase: string; equipos: EquipoSembrado[] }>,
): EquipoSembrado[] {
  const cantidadNiveles = Math.max(0, ...origenes.map((o) => o.equipos.length));
  const combinados: EquipoSembrado[] = [];
  for (let nivel = 0; nivel < cantidadNiveles; nivel++) {
    for (const origen of origenes) {
      const equipo = origen.equipos[nivel];
      if (equipo) combinados.push(equipo);
    }
  }
  // La posición global para la siembra es simplemente el orden en que quedaron acá.
  return combinados.map((equipo, i) => ({ ...equipo, posicion: i + 1 }));
}

/**
 * Revisa si algún cruce de la llave generada enfrenta a dos equipos que
 * vienen del mismo origen (mismo grupo) — para avisarle al usuario, ya que
 * la rotación de niveles reduce el problema pero no siempre lo elimina del
 * todo (ej. un solo grupo seleccionado, o grupos muy desparejos en tamaño).
 */
export function origenDeEquipo(
  equipoId: number,
  origenes: Array<{ fase: string; equipos: EquipoSembrado[] }>,
): string | null {
  for (const origen of origenes) {
    if (origen.equipos.some((e) => e.id === equipoId)) return origen.fase;
  }
  return null;
}
