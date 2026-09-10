import type { Partido, PosicionEquipo } from '@workspace/api-client-react';
import { formatFecha } from '@/lib/utils';

/**
 * El cuadro de la fase final, como la planilla de Excel que se arma a mano
 * todos los años: los grupos a la izquierda y, a la derecha, una columna por
 * ronda de eliminación (octavos, cuartos, semifinal, final) con cada cruce
 * en su caja, el marcador y — si hubo que definir desde el punto penal — los
 * penales al lado.
 *
 * Colores fijos en HSL y no los tokens de tema (mismo criterio que el recibo
 * de pago y las tablas imprimibles): así se ve igual en pantalla, impreso y
 * en modo oscuro.
 */
export interface GrupoDelCuadro {
  nombre: string;
  equipos: Array<{ equipoId: number; equipoNombre: string; posicion: number }>;
}

export interface RondaDelCuadro {
  nombre: string;
  fecha: string | null;
  partidos: Partido[];
}

/** Paleta por grupo, en el mismo orden en que se crean (A, B, C, D...). */
const COLORES_GRUPO = [
  { fondo: 'hsl(140 45% 88%)', barra: 'hsl(140 45% 35%)' },
  { fondo: 'hsl(210 60% 90%)', barra: 'hsl(210 60% 40%)' },
  { fondo: 'hsl(48 85% 88%)', barra: 'hsl(45 80% 40%)' },
  { fondo: 'hsl(280 40% 90%)', barra: 'hsl(280 40% 45%)' },
  { fondo: 'hsl(20 70% 90%)', barra: 'hsl(20 70% 45%)' },
  { fondo: 'hsl(330 50% 92%)', barra: 'hsl(330 50% 45%)' },
];

function CajaCruce({ partido, numero }: { partido: Partido; numero: number }) {
  const hayPenales = partido.penalesLocal != null && partido.penalesVisitante != null;
  // Con penales manda el marcador de penales; si no, el de goles.
  const ganaLocal = partido.jugado
    ? hayPenales
      ? partido.penalesLocal! > partido.penalesVisitante!
      : (partido.golesLocal ?? 0) > (partido.golesVisitante ?? 0)
    : false;
  const ganaVisitante = partido.jugado
    ? hayPenales
      ? partido.penalesVisitante! > partido.penalesLocal!
      : (partido.golesVisitante ?? 0) > (partido.golesLocal ?? 0)
    : false;

  const fila = (
    nombre: string,
    goles: number | null | undefined,
    penales: number | null | undefined,
    gana: boolean,
  ) => (
    <div className="flex items-stretch border-t border-[hsl(273_20%_88%)] first:border-t-0">
      <div className={`flex-1 px-2 py-1 text-[11px] leading-tight truncate ${gana ? 'font-bold' : ''}`}>{nombre}</div>
      <div className="w-7 shrink-0 text-center text-[11px] font-mono border-l border-[hsl(273_20%_88%)] py-1">
        {partido.jugado ? (goles ?? 0) : ''}
      </div>
      {hayPenales && (
        <div className="w-7 shrink-0 text-center text-[11px] font-mono border-l border-[hsl(273_20%_88%)] py-1 bg-[hsl(273_51%_96%)]">
          {penales ?? 0}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex items-center gap-1">
      <div className="w-6 shrink-0 text-[9px] font-bold text-[hsl(273_15%_45%)] text-right">P{numero}</div>
      <div className="flex-1 border border-[hsl(273_20%_75%)] rounded overflow-hidden bg-white">
        {fila(partido.localNombre, partido.golesLocal, partido.penalesLocal, ganaLocal)}
        {fila(partido.visitanteNombre, partido.golesVisitante, partido.penalesVisitante, ganaVisitante)}
      </div>
    </div>
  );
}

export function CuadroFinal({
  grupos,
  rondas,
  tercerPuesto,
}: {
  grupos: GrupoDelCuadro[];
  rondas: RondaDelCuadro[];
  tercerPuesto?: Partido | null;
}) {
  let numeroCruce = 0;

  return (
    <div className="hoja-horizontal bg-white text-[hsl(273_45%_12%)] border border-[hsl(273_20%_85%)] rounded-lg overflow-hidden">
      <div className="bg-[hsl(273_51%_32%)] text-white px-4 py-3 text-center">
        <div className="font-extrabold text-base leading-tight tracking-tight">TORNEO SOCORRO SENIOR MASTER PLUS 40</div>
        <div className="text-xs text-white/80">Fase Final · Eliminación directa</div>
      </div>
      <div className="h-1 bg-[hsl(340_74%_27%)]" />

      <div className="p-4 overflow-x-auto">
        <div className="flex gap-4 items-start min-w-max">
          {/* Grupos a la izquierda */}
          {grupos.length > 0 && (
            <div className="shrink-0 space-y-3 pr-4 border-r-2 border-dashed border-[hsl(340_74%_50%)]">
              <div className="text-[11px] font-bold text-center text-[hsl(340_74%_27%)] uppercase tracking-wide">
                Fase de grupos
              </div>
              <div className="grid grid-cols-2 gap-3">
                {grupos.map((g, i) => {
                  const color = COLORES_GRUPO[i % COLORES_GRUPO.length];
                  return (
                    <div key={g.nombre} className="border border-[hsl(273_20%_75%)] rounded overflow-hidden w-32">
                      <div
                        className="px-2 py-1 text-[11px] font-bold text-center text-white"
                        style={{ background: color.barra }}
                      >
                        {g.nombre}
                      </div>
                      {g.equipos.map((e) => (
                        <div
                          key={e.equipoId}
                          className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] border-t border-[hsl(273_20%_88%)]"
                          style={{ background: color.fondo }}
                        >
                          <span className="w-3 shrink-0 font-mono text-[hsl(273_15%_40%)]">{e.posicion}</span>
                          <span className="truncate">{e.equipoNombre}</span>
                        </div>
                      ))}
                      {g.equipos.length === 0 && (
                        <div className="px-2 py-1 text-[10px] text-[hsl(273_15%_50%)]">Sin equipos</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Una columna por ronda */}
          {rondas.map((ronda) => (
            <div key={ronda.nombre} className="shrink-0 w-44">
              <div className="text-center border border-[hsl(273_20%_75%)] rounded-t bg-[hsl(273_51%_96%)] px-2 py-1">
                <div className="text-[11px] font-bold text-[hsl(273_51%_32%)] uppercase tracking-wide">{ronda.nombre}</div>
                <div className="text-[10px] text-[hsl(273_15%_45%)] font-mono">
                  {ronda.fecha ? formatFecha(ronda.fecha) : 'Sin fecha'}
                </div>
              </div>
              <div className="pt-3 space-y-3 flex flex-col justify-around min-h-24">
                {ronda.partidos.length === 0 ? (
                  <p className="text-[10px] text-[hsl(273_15%_50%)] text-center py-3">Sin cruces todavía.</p>
                ) : (
                  ronda.partidos.map((p) => {
                    numeroCruce += 1;
                    return <CajaCruce key={p.id} partido={p} numero={numeroCruce} />;
                  })
                )}
              </div>
            </div>
          ))}
        </div>

        {tercerPuesto && (
          <div className="mt-4 pt-3 border-t border-[hsl(273_20%_88%)] flex items-center gap-3">
            <div className="text-[11px] font-bold text-[hsl(340_74%_27%)] uppercase tracking-wide shrink-0">3er puesto</div>
            <div className="w-44">
              <CajaCruce partido={tercerPuesto} numero={numeroCruce + 1} />
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] text-[hsl(273_15%_50%)] text-center px-4 pb-3">
        Res. = resultado del partido · Pen. = definición por penales.
      </p>
    </div>
  );
}
