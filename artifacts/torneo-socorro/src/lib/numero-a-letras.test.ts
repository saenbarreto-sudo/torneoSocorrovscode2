/**
 * Comprobación de src/lib/numero-a-letras.ts. Un monto mal escrito en un
 * recibo de caja real es el peor tipo de error posible aquí, así que vale
 * la pena verificarlo con casos conocidos antes de confiar en el resultado.
 *
 * Correr con los contenedores levantados:
 *   docker compose exec api sh -c "cd /app && ./lib/db/node_modules/.bin/tsx artifacts/torneo-socorro/src/lib/numero-a-letras.test.ts"
 */
import { numeroALetras, montoEnLetras } from "./numero-a-letras";

const casos: Array<[number, string]> = [
  [0, "CERO"],
  [1, "UNO"],
  [7, "SIETE"],
  [10, "DIEZ"],
  [11, "ONCE"],
  [15, "QUINCE"],
  [16, "DIECISEIS"],
  [20, "VEINTE"],
  [21, "VEINTIUNO"],
  [29, "VEINTINUEVE"],
  [30, "TREINTA"],
  [31, "TREINTA Y UNO"],
  [45, "CUARENTA Y CINCO"],
  [99, "NOVENTA Y NUEVE"],
  [100, "CIEN"],
  [101, "CIENTO UNO"],
  [115, "CIENTO QUINCE"],
  [200, "DOSCIENTOS"],
  [231, "DOSCIENTOS TREINTA Y UNO"],
  [500, "QUINIENTOS"],
  [999, "NOVECIENTOS NOVENTA Y NUEVE"],
  [1000, "MIL"],
  [1001, "MIL UNO"],
  [2000, "DOS MIL"],
  [7000, "SIETE MIL"],
  [21000, "VEINTIUN MIL"],
  [31000, "TREINTA Y UN MIL"],
  [100000, "CIEN MIL"],
  [101000, "CIENTO UN MIL"],
  [150000, "CIENTO CINCUENTA MIL"],
  [200000, "DOSCIENTOS MIL"],
  [1000000, "UN MILLON"],
  [1000001, "UN MILLON UNO"],
  [2000000, "DOS MILLONES"],
  [21000000, "VEINTIUN MILLONES"],
  [1500000, "UN MILLON QUINIENTOS MIL"],
];

let todoBien = true;
for (const [numero, esperado] of casos) {
  const resultado = numeroALetras(numero);
  const ok = resultado === esperado;
  if (!ok) todoBien = false;
  console.log(`${String(numero).padStart(10)} -> ${resultado.padEnd(35)} ${ok ? "OK" : `FALLA (esperaba "${esperado}")`}`);
}

const casosMonto: Array<[number, string]> = [
  [1, "UN PESO M/CTE"],
  [7000, "SIETE MIL PESOS M/CTE"],
  [80000, "OCHENTA MIL PESOS M/CTE"],
  [250000, "DOSCIENTOS CINCUENTA MIL PESOS M/CTE"],
  [1000000, "UN MILLON PESOS M/CTE"],
  // La apócope antes de "PESOS" (distinta de la de antes de "MIL"/"MILLONES",
  // que ya se prueba arriba en numeroALetras): en la práctica el torneo
  // siempre cobra en miles redondos, así que esto casi nunca ocurre, pero
  // tiene que quedar bien si algún día pasa.
  [21, "VEINTIUN PESOS M/CTE"],
  [1001, "MIL UN PESOS M/CTE"],
  [1000001, "UN MILLON UN PESOS M/CTE"],
];

console.log('\n── montoEnLetras (con "PESOS M/CTE") ──');
for (const [monto, esperado] of casosMonto) {
  const resultado = montoEnLetras(monto);
  const ok = resultado === esperado;
  if (!ok) todoBien = false;
  console.log(`  ${monto.toLocaleString("es-CO").padStart(12)} -> ${resultado.padEnd(38)} ${ok ? "OK" : `FALLA (esperaba "${esperado}")`}`);
}

console.log(todoBien ? "\nTODAS LAS PRUEBAS PASARON" : "\nHAY FALLAS");
process.exit(todoBien ? 0 : 1);
