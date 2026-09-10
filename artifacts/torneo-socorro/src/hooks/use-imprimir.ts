import { useEffect, useState } from 'react';

/**
 * Maneja el "imprimir solo este bloque": prende el portal de impresión,
 * espera a que React lo monte y recién ahí llama a window.print() — si se
 * llamara en el mismo tick, el navegador imprimiría antes de que el
 * contenido exista. Al terminar lo apaga solo.
 *
 * Se usa junto con <ImprimirPortal activo={imprimiendo}>.
 */
export function useImprimir() {
  const [imprimiendo, setImprimiendo] = useState(false);

  useEffect(() => {
    if (!imprimiendo) return;
    const id = window.setTimeout(() => {
      window.print();
      setImprimiendo(false);
    }, 60);
    return () => window.clearTimeout(id);
  }, [imprimiendo]);

  return { imprimiendo, imprimir: () => setImprimiendo(true) };
}
