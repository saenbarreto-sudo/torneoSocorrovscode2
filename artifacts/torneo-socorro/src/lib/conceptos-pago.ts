/**
 * Los conceptos de pago del torneo, en el mismo orden en que aparecen en el
 * formulario de "Nuevo Recibo". Un solo lugar para esta lista y sus
 * etiquetas: la usan el formulario de pagos, el recibo impreso y el
 * selector del estado de cuenta.
 */
export const CONCEPTOS = ['Inscripcion', 'Multas', 'Carnet', 'Rojas', 'Amarillas', 'FOFI', 'Traspaso'] as const;

export type Concepto = (typeof CONCEPTOS)[number];

export const CONCEPTO_LABEL: Record<string, string> = {
  Inscripcion: 'Inscripción',
  Multas: 'Multas',
  Carnet: 'Carné',
  Rojas: 'Tarjeta roja',
  Amarillas: 'Tarjeta amarilla',
  FOFI: 'FOFI',
  Traspaso: 'Traspaso',
};

/**
 * true si esa plata entró en la mesa de un día de juego (el arbitraje que
 * paga cada equipo, o una cinta de capitán) en vez de ser un recibo.
 *
 * Esos ingresos los crea la pantalla de Mesa al guardar el cuadre del día y
 * a propósito NO llevan consecutivo de recibo (ver routes/mesas.ts): no se
 * le entrega un comprobante numerado al equipo por los $70.000 del
 * arbitraje. Por eso las listas de recibos los dejan fuera — igual siguen
 * contando como ingreso en Tesorería y en la cuenta del equipo, que es
 * donde tienen que estar.
 */
export function esIngresoDeMesa(pago: { mesaId?: number | null }): boolean {
  return pago.mesaId != null;
}
