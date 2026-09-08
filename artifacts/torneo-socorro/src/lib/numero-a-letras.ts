/**
 * Convierte un valor en pesos a su escritura en letras, como se acostumbra
 * en los recibos de caja físicos ("la suma de: OCHENTA MIL PESOS M/CTE").
 *
 * Solo maneja números enteros no negativos (los montos del torneo siempre
 * lo son). Cubre hasta 999.999.999 — de sobra para cualquier monto real
 * del torneo.
 */

const UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];

const DIEZ_A_VEINTINUEVE = [
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE",
  "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE",
  "VEINTE", "VEINTIUNO", "VEINTIDOS", "VEINTITRES", "VEINTICUATRO",
  "VEINTICINCO", "VEINTISEIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE",
];

const DECENAS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];

const CENTENAS = [
  "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS",
  "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS",
];

function decenas(n: number): string {
  if (n < 10) return UNIDADES[n];
  if (n < 30) return DIEZ_A_VEINTINUEVE[n - 10];
  const decena = Math.floor(n / 10);
  const resto = n % 10;
  return DECENAS[decena] + (resto > 0 ? ` Y ${UNIDADES[resto]}` : "");
}

/** Un grupo de 0 a 999. */
function grupoDeTres(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const centena = Math.floor(n / 100);
  const resto = n % 100;
  const partes = [];
  if (centena > 0) partes.push(CENTENAS[centena]);
  if (resto > 0) partes.push(decenas(resto));
  return partes.join(" ");
}

/**
 * "UNO" / "VEINTIUNO" / "TREINTA Y UNO" pierden la O final antes de un
 * sustantivo masculino: "VEINTIUN pesos", "VEINTIUN mil". Antes de "MIL" y
 * "MILLONES" la apócope es obligatoria siempre (es parte de cómo se escribe
 * el número, no depende del contexto), por eso va integrada aquí adentro.
 * Antes de "PESOS" solo aplica al leer el número como dinero, así que esa
 * la hace aparte montoEnLetras() sobre el resultado ya armado.
 */
function conApocope(texto: string): string {
  return texto.replace(/UNO$/, "UN");
}

/** El número completo en letras, sin la palabra "PESOS". */
export function numeroALetras(n: number): string {
  if (n === 0) return "CERO";

  const millones = Math.floor(n / 1_000_000);
  const resto1 = n % 1_000_000;
  const miles = Math.floor(resto1 / 1000);
  const resto2 = resto1 % 1000;

  const partes: string[] = [];

  if (millones > 0) {
    partes.push(millones === 1 ? "UN MILLON" : `${conApocope(grupoDeTres(millones))} MILLONES`);
  }
  if (miles > 0) {
    partes.push(miles === 1 ? "MIL" : `${conApocope(grupoDeTres(miles))} MIL`);
  }
  if (resto2 > 0 || partes.length === 0) {
    partes.push(grupoDeTres(resto2));
  }

  return partes.join(" ");
}

/** "$80.000" → "OCHENTA MIL PESOS M/CTE", listo para el recibo. */
export function montoEnLetras(pesos: number): string {
  const entero = Math.round(Math.abs(pesos));
  if (entero === 1) return "UN PESO M/CTE";
  return `${conApocope(numeroALetras(entero))} PESOS M/CTE`;
}
