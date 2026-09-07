/**
 * Comprobación del generador de calendario (src/lib/fixture.ts).
 *
 * No es una prueba de un framework: es un script que se corre a mano y avisa
 * si el calendario generado deja de cumplir las reglas del torneo. El proyecto
 * todavía no tiene un corredor de pruebas, y esta lógica es la que más se
 * puede romper en silencio (un cruce repetido no se nota hasta media
 * temporada).
 *
 * Para correrlo, con los contenedores levantados:
 *
 *   docker compose exec api sh -c "cd /app && ./lib/db/node_modules/.bin/tsx artifacts/torneo-socorro/src/lib/fixture.test.ts"
 *
 * Sale con código 1 si algo falla.
 *
 * Se llama ".test.ts" a propósito: el tsconfig del frontend excluye ese
 * patrón, así que no entra ni al typecheck ni al build de la aplicación.
 */
import { generarFixture, claveEnfrentamiento } from "./fixture";

/**
 * Comprueba, para una cantidad de equipos dada, que el calendario cumpla:
 *  - el número de jornadas que corresponde,
 *  - ningún equipo jugando dos veces en la misma jornada,
 *  - cada cruce exactamente una vez por vuelta,
 *  - todos los equipos cubiertos en cada jornada (jugando o descansando),
 *  - semanas sin repetir,
 *  - localías repartidas (nadie siempre de local).
 */
function probar(n: number, idaYVuelta: boolean) {
  const equipos = Array.from({ length: n }, (_, i) => ({ id: i + 1, nombre: `E${i + 1}` }));
  const jornadas = generarFixture({
    equipos,
    idaYVuelta,
    semanaInicial: 1,
    fechaInicial: "2026-02-07",
    diasEntreJornadas: 7,
  });

  const errores: string[] = [];
  const jornadasPorVuelta = n % 2 === 0 ? n - 1 : n;
  const esperadoJornadas = jornadasPorVuelta * (idaYVuelta ? 2 : 1);
  if (jornadas.length !== esperadoJornadas) {
    errores.push(`jornadas ${jornadas.length} != ${esperadoJornadas}`);
  }

  const conteoCruce = new Map<string, number>();
  const local = new Map<number, number>();
  const visita = new Map<number, number>();
  const descansos = new Map<number, number>();
  const semanas = new Set<number>();

  for (const j of jornadas) {
    if (semanas.has(j.semana)) errores.push(`semana repetida ${j.semana}`);
    semanas.add(j.semana);

    const vistos = new Set<number>();
    for (const p of j.partidos) {
      if (p.local.id === p.visitante.id) errores.push(`equipo contra sí mismo en j${j.jornada}`);
      if (vistos.has(p.local.id) || vistos.has(p.visitante.id)) {
        errores.push(`equipo dos veces en la jornada ${j.vuelta}-${j.jornada}`);
      }
      vistos.add(p.local.id);
      vistos.add(p.visitante.id);

      const k = `v${p.vuelta}:` + claveEnfrentamiento(p.local.id, p.visitante.id);
      conteoCruce.set(k, (conteoCruce.get(k) ?? 0) + 1);
      local.set(p.local.id, (local.get(p.local.id) ?? 0) + 1);
      visita.set(p.visitante.id, (visita.get(p.visitante.id) ?? 0) + 1);
    }

    if (j.descansa) descansos.set(j.descansa.id, (descansos.get(j.descansa.id) ?? 0) + 1);

    const cubiertos = j.partidos.length * 2 + (j.descansa ? 1 : 0);
    if (cubiertos !== n) {
      errores.push(`la jornada ${j.vuelta}-${j.jornada} cubre ${cubiertos} equipos, no ${n}`);
    }
  }

  const cruceEsperado = (n * (n - 1)) / 2;
  for (const v of idaYVuelta ? [1, 2] : [1]) {
    const delaVuelta = [...conteoCruce.keys()].filter((k) => k.startsWith(`v${v}:`));
    if (delaVuelta.length !== cruceEsperado) {
      errores.push(`vuelta ${v}: ${delaVuelta.length} cruces distintos, esperados ${cruceEsperado}`);
    }
    for (const k of delaVuelta) if (conteoCruce.get(k) !== 1) errores.push(`cruce repetido ${k}`);
  }

  if (n % 2 !== 0) {
    for (const e of equipos) {
      const d = descansos.get(e.id) ?? 0;
      if (d !== (idaYVuelta ? 2 : 1)) errores.push(`el equipo ${e.id} descansa ${d} veces`);
    }
  }

  // Nadie debería quedar siempre de local: con la rueda del método del círculo
  // la diferencia no puede pasar de 1.
  const maxDesbalance = Math.max(
    ...equipos.map((e) => Math.abs((local.get(e.id) ?? 0) - (visita.get(e.id) ?? 0))),
  );
  if (maxDesbalance > 1) errores.push(`localías desbalanceadas (diferencia ${maxDesbalance})`);

  const totalPartidos = jornadas.reduce((a, j) => a + j.partidos.length, 0);
  console.log(
    `n=${String(n).padStart(2)} ${idaYVuelta ? "ida+vuelta" : "solo ida  "} | ` +
      `jornadas=${String(jornadas.length).padStart(2)} | partidos=${String(totalPartidos).padStart(4)} | ` +
      `max|local-visita|=${maxDesbalance} | ` +
      (errores.length === 0 ? "OK" : "FALLA: " + errores.slice(0, 3).join("; ")),
  );
  return errores.length === 0;
}

let todoBien = true;
for (const n of [2, 3, 4, 5, 6, 8, 11, 16, 29, 34]) {
  todoBien = probar(n, false) && todoBien;
  todoBien = probar(n, true) && todoBien;
}

console.log(todoBien ? "\nTODAS LAS PRUEBAS PASARON" : "\nHAY FALLAS");
process.exit(todoBien ? 0 : 1);
