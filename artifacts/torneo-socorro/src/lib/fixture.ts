/**
 * Generación del calendario del torneo (todos contra todos).
 *
 * Usa el "método del círculo": se fija un equipo y los demás rotan alrededor.
 * Con eso se garantiza que en cada jornada ningún equipo juegue dos veces y
 * que, al terminar la vuelta, cada equipo se haya enfrentado exactamente una
 * vez con todos los demás.
 *
 * Si el número de equipos es impar se agrega un "hueco": el equipo que queda
 * emparejado con él descansa esa jornada.
 *
 * La segunda vuelta repite las mismas jornadas invirtiendo local y visitante,
 * que es como se juega la revancha en el torneo.
 *
 * Este archivo es lógica pura (sin React ni llamadas a la API) para poder
 * razonarlo y probarlo por separado.
 */

export interface EquipoFixture {
  id: number;
  nombre: string;
}

export interface PartidoFixture {
  /** Clave estable para marcar/desmarcar el partido en la vista previa. */
  clave: string;
  vuelta: 1 | 2;
  jornada: number;
  semana: number;
  fecha: string | null;
  local: EquipoFixture;
  visitante: EquipoFixture;
}

export interface JornadaFixture {
  vuelta: 1 | 2;
  /** Número de jornada dentro de su vuelta (empieza en 1 en cada vuelta). */
  jornada: number;
  /** Número de semana global, el que se guarda en cada partido. */
  semana: number;
  fecha: string | null;
  partidos: PartidoFixture[];
  /** Equipo que no juega esta jornada (solo cuando el total es impar). */
  descansa: EquipoFixture | null;
}

export interface OpcionesFixture {
  equipos: EquipoFixture[];
  /** true = ida y vuelta; false = solo primera vuelta. */
  idaYVuelta: boolean;
  /** Número de semana de la primera jornada. */
  semanaInicial: number;
  /** Fecha de la primera jornada (yyyy-mm-dd). Si no se da, no se calculan fechas. */
  fechaInicial?: string | null;
  /** Días entre una jornada y la siguiente. 7 = una fecha por semana. */
  diasEntreJornadas?: number;
}

/** Suma días a una fecha yyyy-mm-dd sin que la zona horaria corra el día. */
export function sumarDias(fechaISO: string, dias: number): string {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  const resultado = new Date(base + dias * 24 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${resultado.getUTCFullYear()}-${p(resultado.getUTCMonth() + 1)}-${p(resultado.getUTCDate())}`;
}

/**
 * Emparejamientos de la primera vuelta, en orden de jornada.
 * Devuelve pares de índices sobre el arreglo recibido; -1 representa el hueco
 * del equipo que descansa.
 */
function rondasDelCirculo(cantidad: number): Array<Array<[number, number]>> {
  // Con número impar de equipos se agrega un hueco (-1) para emparejar.
  const posiciones: number[] = Array.from({ length: cantidad }, (_, i) => i);
  if (posiciones.length % 2 !== 0) posiciones.push(-1);

  const total = posiciones.length;
  const rondas: Array<Array<[number, number]>> = [];
  let rueda = [...posiciones];

  for (let ronda = 0; ronda < total - 1; ronda++) {
    const pares: Array<[number, number]> = [];

    for (let i = 0; i < total / 2; i++) {
      const a = rueda[i];
      const b = rueda[total - 1 - i];
      // Los equipos que rotan pasan por la mitad de arriba de la rueda (local)
      // y por la de abajo (visitante) casi el mismo número de veces, así que
      // ahí basta con respetar la posición. El de la posición fija nunca se
      // mueve: si no se le alterna la localía a mano, quedaría de local en
      // todos sus partidos.
      const invertir = i === 0 && ronda % 2 === 1;
      pares.push(invertir ? [b, a] : [a, b]);
    }

    rondas.push(pares);

    // El primero queda fijo y el resto rota una posición.
    rueda = [rueda[0], rueda[total - 1], ...rueda.slice(1, total - 1)];
  }

  return rondas;
}

export function generarFixture(op: OpcionesFixture): JornadaFixture[] {
  const { equipos, idaYVuelta, semanaInicial } = op;
  const diasEntreJornadas = op.diasEntreJornadas ?? 7;
  const fechaInicial = op.fechaInicial || null;

  if (equipos.length < 2) return [];

  const rondas = rondasDelCirculo(equipos.length);
  const jornadas: JornadaFixture[] = [];

  const vueltas: Array<1 | 2> = idaYVuelta ? [1, 2] : [1];

  for (const vuelta of vueltas) {
    rondas.forEach((pares, indiceRonda) => {
      // El índice global cuenta las jornadas de las dos vueltas seguidas, para
      // que las semanas y las fechas sigan corriendo sin repetirse.
      const indiceGlobal = jornadas.length;
      const semana = semanaInicial + indiceGlobal;
      const fecha = fechaInicial ? sumarDias(fechaInicial, indiceGlobal * diasEntreJornadas) : null;

      let descansa: EquipoFixture | null = null;
      const partidos: PartidoFixture[] = [];

      for (const [a, b] of pares) {
        if (a === -1 || b === -1) {
          descansa = equipos[a === -1 ? b : a];
          continue;
        }
        // En la segunda vuelta se invierte la localía (la revancha).
        const local = vuelta === 1 ? equipos[a] : equipos[b];
        const visitante = vuelta === 1 ? equipos[b] : equipos[a];

        partidos.push({
          clave: `v${vuelta}-j${indiceRonda + 1}-${local.id}x${visitante.id}`,
          vuelta,
          jornada: indiceRonda + 1,
          semana,
          fecha,
          local,
          visitante,
        });
      }

      jornadas.push({
        vuelta,
        jornada: indiceRonda + 1,
        semana,
        fecha,
        partidos,
        descansa,
      });
    });
  }

  return jornadas;
}

/**
 * Clave para comparar un emparejamiento con los partidos que ya existen, sin
 * importar quién sea local: en el torneo no se programa dos veces el mismo
 * cruce dentro de la misma vuelta.
 */
export function claveEnfrentamiento(equipoA: number, equipoB: number): string {
  return equipoA < equipoB ? `${equipoA}-${equipoB}` : `${equipoB}-${equipoA}`;
}
