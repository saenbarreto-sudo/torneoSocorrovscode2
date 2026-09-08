import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Monta su contenido directo bajo <body> (fuera de cualquier diálogo),
 * oculto en pantalla y visible solo al imprimir. Ver el comentario junto a
 * ".imprimir-solo" en index.css para el porqué de este enfoque en vez de
 * imprimir directo lo que ya se ve dentro del diálogo.
 *
 * Se usa para el recibo de pago y los extractos (de equipo y de jugador):
 * cada uno arma su propio contenido y lo pasa aquí adentro.
 */
export function ImprimirPortal({ activo, children }: { activo: boolean; children: ReactNode }) {
  if (!activo) return null;
  return createPortal(
    <div className="imprimir-solo hidden print:block">{children}</div>,
    document.body,
  );
}
