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
