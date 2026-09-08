import { createPortal } from 'react-dom';
import type { Pago, Equipo } from '@workspace/api-client-react';
import { ReciboPago } from './recibo-pago';

/**
 * Copia del recibo que solo existe para imprimirse: se monta directo bajo
 * <body> (fuera del diálogo) con "hidden print:block" (invisible en
 * pantalla, visible solo al imprimir).
 *
 * Va por fuera del diálogo a propósito. Ver el comentario en index.css
 * junto a ".recibo-para-imprimir": intentar imprimir la copia de ADENTRO
 * del diálogo salía recortada en el PDF real, porque el diálogo de Radix
 * trae su propio "transform" y "overflow" para la pantalla que hay que
 * pelear para anular. Puesta afuera, como hijo directo de <body>, no hace
 * falta pelear con nada de eso.
 */
export function ReciboParaImprimir({
  pago,
  equipo,
  recibidoPor,
}: {
  pago: Pago | null;
  equipo?: Equipo;
  recibidoPor?: string | null;
}) {
  if (!pago) return null;
  return createPortal(
    <div className="recibo-para-imprimir hidden print:block">
      <ReciboPago pago={pago} equipo={equipo} recibidoPor={recibidoPor} />
    </div>,
    document.body,
  );
}
