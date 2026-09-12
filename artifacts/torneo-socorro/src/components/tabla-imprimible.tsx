import type { ReactNode } from 'react';

/**
 * Cualquiera de las tablas del torneo (posiciones, goleadores, valla menos
 * vencida) lista para imprimir o mandar por WhatsApp. Mismo patrón que el
 * recibo de pago y los extractos (components/recibo-pago.tsx,
 * programacion-imprimible.tsx): colores fijos en HSL y no los tokens de
 * tema, para que se vea igual sin importar el modo oscuro/claro.
 *
 * Recibe las celdas ya armadas en vez de los datos crudos: cada tabla sabe
 * cómo mostrar lo suyo (medallas, promedios, diferencia de gol) y acá solo
 * se les pone el marco y el encabezado del torneo.
 */
export interface ColumnaImprimible {
  encabezado: string;
  alineacion?: 'centro' | 'derecha';
}

export interface FilaImprimible {
  clave: string | number;
  celdas: ReactNode[];
  /** Resalta la fila (ej. los que clasifican en la tabla general). */
  destacada?: boolean;
}

function claseAlineacion(alineacion?: 'centro' | 'derecha'): string {
  if (alineacion === 'centro') return 'text-center';
  if (alineacion === 'derecha') return 'text-right';
  return 'text-left';
}

export function TablaImprimible({
  titulo,
  subtitulo,
  columnas,
  filas,
  nota,
}: {
  titulo: string;
  subtitulo?: string;
  columnas: ColumnaImprimible[];
  filas: FilaImprimible[];
  nota?: string;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [ano, mes, dia] = hoy.split('-');

  return (
    <div className="bg-white text-[hsl(273_45%_12%)] border border-[hsl(273_20%_85%)] rounded-lg overflow-hidden max-w-2xl mx-auto">
      {/* Grilla 1fr/auto/1fr para que el nombre del torneo quede centrado de
          verdad, sin importar qué tan ancho sea lo de los costados. */}
      <div className="bg-[hsl(273_51%_32%)] text-white px-6 py-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <img
          src="/logo-torneo-socorro.png"
          alt="Escudo Torneo Socorro"
          className="h-14 w-14 object-contain shrink-0 justify-self-start"
        />
        <div className="text-center">
          <div className="font-extrabold text-lg leading-tight tracking-tight">TORNEO SOCORRO</div>
          <div className="text-xs text-white/80 tracking-wide">SENIOR MASTER PLUS 40</div>
          <div className="text-xs font-bold mt-1.5 bg-white/15 inline-block px-2 py-0.5 rounded">
            {titulo}
            {subtitulo && ` · ${subtitulo}`}
          </div>
        </div>
        <div className="text-right shrink-0 justify-self-end">
          <div className="text-[10px] text-white/70 uppercase tracking-wide">Generado</div>
          <div className="font-mono text-sm">{`${dia}/${mes}/${ano}`}</div>
        </div>
      </div>
      <div className="h-1.5 bg-[hsl(340_74%_27%)]" />

      <div className="px-6 py-5">
        {filas.length === 0 ? (
          <p className="text-sm text-[hsl(273_15%_40%)] text-center py-4">Todavía no hay datos para esta tabla.</p>
        ) : (
          /* Encabezado morado y filas alternadas, como el cuadro de la fase
             final: la tabla se lee de un vistazo y se ve del torneo, no como
             una lista pegada. */
          <div className="rounded-md overflow-hidden border border-[hsl(273_20%_82%)]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[hsl(273_51%_32%)] text-white text-[10px] uppercase tracking-wide">
                  {columnas.map((c) => (
                    <th key={c.encabezado} className={`py-2 px-2 font-bold ${claseAlineacion(c.alineacion)}`}>
                      {c.encabezado}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((fila, indice) => (
                  <tr
                    key={fila.clave}
                    className={
                      fila.destacada
                        ? 'bg-[hsl(340_74%_94%)] font-bold border-l-[3px] border-l-[hsl(340_74%_45%)]'
                        : indice % 2 === 1
                          ? 'bg-[hsl(273_40%_97%)]'
                          : 'bg-white'
                    }
                  >
                    {fila.celdas.map((celda, i) => (
                      <td
                        key={i}
                        className={`py-1.5 px-2 border-t border-[hsl(273_20%_90%)] ${claseAlineacion(columnas[i]?.alineacion)}`}
                      >
                        {celda}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {nota && <p className="text-[10px] text-[hsl(273_15%_50%)] px-6 pb-2">{nota}</p>}
      <p className="text-[10px] text-[hsl(273_15%_50%)] text-center px-6 pb-4">
        Torneo Socorro Senior Master Plus 40 · Sujeto a cambios por el Comité.
      </p>
    </div>
  );
}
