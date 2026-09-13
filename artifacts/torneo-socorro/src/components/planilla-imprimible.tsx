import { useEffect } from 'react';
import { useGetPlanilla } from '@workspace/api-client-react';
import type { Partido, Planilla, PlanillaJugador } from '@workspace/api-client-react';
import { ImprimirPortal } from '@/components/imprimir-portal';
import { formatFechaConDia, formatHora12 } from '@/lib/utils';
import { colorDeEquipo } from '@/lib/color-equipo';

/**
 * El acta del partido, ya diligenciada, lista para imprimirle una copia a
 * cada delegado. Reemplaza a la planilla de papel que llenaba la mesa: la
 * toma de datos se hace en el programa y de ahí sale este impreso.
 *
 * Mismo estilo de marca que el resto de lo imprimible (ver
 * components/tabla-imprimible.tsx): colores fijos en HSL y no los tokens de
 * tema, para que salga igual sin importar el modo oscuro o claro.
 *
 * Lista solo a los ALINEADOS, no la nómina completa: esto no es la hoja en
 * blanco que se llena en la cancha, es el acta de lo que pasó — quién jugó,
 * quién marcó y quién quedó sancionado.
 *
 * No lleva el bloque de "dato financiero" que sí tiene la planilla de papel:
 * la plata del torneo ya vive en Pagos, Mi cuenta y Sancionados, y repetirla
 * acá solo abre la puerta a que dos papeles digan cosas distintas.
 */

const PUNTOS_AMARILLA = 10;
const PUNTOS_ROJA = 20;

/** Una celda de conteo: en blanco cuando es cero, para que el ojo solo vea lo que pasó. */
function Conteo({ valor }: { valor: number }) {
  if (valor <= 0) return <span className="text-[hsl(273_15%_75%)]">·</span>;
  return <span className="font-bold">{valor}</span>;
}

function NominaImpresa({
  nombre,
  color,
  jugadores,
  goles,
}: {
  nombre: string;
  color?: string | null;
  jugadores: PlanillaJugador[];
  goles: number;
}) {
  const fairPlay = jugadores.reduce((s, j) => s + j.amarillas * PUNTOS_AMARILLA + j.rojas * PUNTOS_ROJA, 0);
  const expulsados = jugadores.filter((j) => j.rojas > 0);

  return (
    <div className="rounded-md overflow-hidden border border-[hsl(273_20%_82%)] break-inside-avoid">
      <div className="bg-[hsl(273_51%_32%)] text-white px-2.5 py-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 min-w-0">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-white/40"
            style={{ background: colorDeEquipo(nombre, color) }}
          />
          <span className="font-bold text-[11px] uppercase tracking-wide truncate">{nombre}</span>
        </span>
        <span className="font-mono font-bold text-base leading-none shrink-0">{goles}</span>
      </div>

      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr className="bg-[hsl(273_51%_94%)] text-[hsl(273_51%_32%)] text-[8px] uppercase tracking-wide">
            <th className="py-1 px-1 text-center font-bold w-7" title="Dorsal">N°</th>
            <th className="py-1 px-1 text-left font-bold w-11">Carné</th>
            <th className="py-1 px-1 text-left font-bold">Jugador</th>
            <th className="py-1 px-1 text-center font-bold w-5" title="Amarillas">A</th>
            <th className="py-1 px-1 text-center font-bold w-5" title="Rojas">R</th>
            <th className="py-1 px-1 text-center font-bold w-5" title="Goles">G</th>
          </tr>
        </thead>
        <tbody>
          {jugadores.map((j, i) => (
            <tr
              key={j.jugadorId}
              className={
                j.rojas > 0
                  ? 'bg-[hsl(340_74%_94%)] border-l-[3px] border-l-[hsl(340_74%_45%)]'
                  : i % 2 === 1
                    ? 'bg-[hsl(273_40%_97%)]'
                    : 'bg-white'
              }
            >
              <td className="py-0.5 px-1 text-center font-mono border-t border-[hsl(273_20%_90%)]">
                {j.dorsal ?? '—'}
              </td>
              <td className="py-0.5 px-1 font-mono text-[hsl(273_15%_45%)] border-t border-[hsl(273_20%_90%)]">
                {j.nCarnet ?? '—'}
              </td>
              <td className="py-0.5 px-1 font-medium border-t border-[hsl(273_20%_90%)]">
                {j.jugadorNombre}
                {!j.titular && <span className="ml-1 text-[7px] text-[hsl(273_15%_55%)] uppercase">supl.</span>}
              </td>
              <td className="py-0.5 px-1 text-center border-t border-[hsl(273_20%_90%)]"><Conteo valor={j.amarillas} /></td>
              <td className="py-0.5 px-1 text-center border-t border-[hsl(273_20%_90%)]"><Conteo valor={j.rojas} /></td>
              <td className="py-0.5 px-1 text-center border-t border-[hsl(273_20%_90%)]"><Conteo valor={j.goles} /></td>
            </tr>
          ))}
          {jugadores.length === 0 && (
            <tr>
              <td colSpan={6} className="py-3 text-center text-[hsl(273_15%_50%)]">
                No quedó nadie alineado por este equipo.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="flex items-center justify-between gap-2 px-2 py-1 bg-[hsl(273_40%_97%)] border-t border-[hsl(273_20%_85%)] text-[8px] uppercase tracking-wide text-[hsl(273_15%_45%)]">
        <span>Alineados: <strong className="text-[hsl(273_45%_12%)]">{jugadores.length}</strong></span>
        <span>Juego limpio: <strong className="text-[hsl(273_45%_12%)]">{fairPlay}</strong></span>
      </div>

      {/* Lo que de verdad le interesa al delegado que se lleva la copia: a
          quién no puede alinear la próxima fecha, y por cuántas. */}
      {expulsados.length > 0 && (
        <div className="px-2 py-1.5 bg-[hsl(340_74%_96%)] border-t-2 border-[hsl(340_74%_45%)]">
          {expulsados.map((j) => (
            <div key={j.jugadorId} className="text-[9px] text-[hsl(340_74%_27%)] leading-snug">
              <strong className="uppercase">Expulsado ·</strong> {j.jugadorNombre}
              {(j.fechasSancion ?? 0) > 0
                ? ` — suspendido ${j.fechasSancion === 1 ? '1 fecha' : `${j.fechasSancion} fechas`}`
                : ' — sanción pendiente de definir por el Comité'}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[8px] uppercase tracking-wide text-[hsl(273_15%_50%)]">{etiqueta}</div>
      <div className="text-[10px] font-bold truncate">{valor}</div>
    </div>
  );
}

function Firma({ titulo, nombre }: { titulo: string; nombre?: string }) {
  return (
    <div className="text-center">
      <div className="border-t border-[hsl(273_45%_25%)] pt-1 mx-1">
        <div className="text-[8px] uppercase tracking-wide text-[hsl(273_15%_45%)]">{titulo}</div>
        {nombre && <div className="text-[9px] font-bold truncate">{nombre}</div>}
      </div>
    </div>
  );
}

export function PlanillaImprimible({
  partido,
  planilla,
  colorLocal,
  colorVisitante,
}: {
  partido: Partido;
  planilla: Planilla;
  colorLocal?: string | null;
  colorVisitante?: string | null;
}) {
  const alineados = planilla.jugadores.filter((j) => j.jugo);
  const ordenar = (lista: PlanillaJugador[]) =>
    [...lista].sort((a, b) => {
      // Primero los titulares, y dentro de cada grupo por dorsal; los que no
      // tienen dorsal van al final, por nombre.
      if (a.titular !== b.titular) return a.titular ? -1 : 1;
      if (a.dorsal != null && b.dorsal != null) return a.dorsal - b.dorsal;
      if (a.dorsal != null) return -1;
      if (b.dorsal != null) return 1;
      return a.jugadorNombre.localeCompare(b.jugadorNombre);
    });

  const locales = ordenar(alineados.filter((j) => j.equipoId === planilla.localId));
  const visitantes = ordenar(alineados.filter((j) => j.equipoId === planilla.visitanteId));

  const hayPenales = partido.penalesLocal != null && partido.penalesVisitante != null;
  const [ano, mes, dia] = new Date().toISOString().slice(0, 10).split('-');

  return (
    <div className="bg-white text-[hsl(273_45%_12%)] border border-[hsl(273_20%_85%)] rounded-lg overflow-hidden max-w-3xl mx-auto">
      {/* Grilla 1fr/auto/1fr para que el nombre del torneo quede centrado de
          verdad, igual que en tabla-imprimible.tsx. */}
      <div className="bg-[hsl(273_51%_32%)] text-white px-5 py-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <img
          src="/logo-torneo-socorro.png"
          alt="Escudo Torneo Socorro"
          className="h-12 w-12 object-contain shrink-0 justify-self-start"
        />
        <div className="text-center">
          <div className="font-extrabold text-base leading-tight tracking-tight">TORNEO SOCORRO</div>
          <div className="text-[10px] text-white/80 tracking-wide">SENIOR MASTER PLUS 40</div>
          <div className="text-[10px] font-bold mt-1 bg-white/15 inline-block px-2 py-0.5 rounded">
            PLANILLA DEL PARTIDO · FECHA {partido.semana}
          </div>
        </div>
        <div className="text-right shrink-0 justify-self-end">
          <div className="text-[9px] text-white/70 uppercase tracking-wide">Impresa</div>
          <div className="font-mono text-xs">{`${dia}/${mes}/${ano}`}</div>
        </div>
      </div>
      <div className="h-1.5 bg-[hsl(340_74%_27%)]" />

      <div className="px-5 py-4 space-y-3">
        {/* Información general — el mismo encabezado de la planilla de papel. */}
        <div className="rounded-md border border-[hsl(273_20%_85%)] overflow-hidden">
          <div className="bg-[hsl(340_74%_27%)] text-white text-[9px] font-bold uppercase tracking-wide px-2.5 py-1">
            Información general
          </div>
          <div className="grid grid-cols-5 gap-2 px-2.5 py-2">
            <Dato etiqueta="Fecha N°" valor={String(partido.semana)} />
            <Dato etiqueta="Día" valor={partido.fecha ? formatFechaConDia(partido.fecha) : 'Sin fecha'} />
            <Dato etiqueta="Hora" valor={partido.hora ? formatHora12(partido.hora) : '—'} />
            <Dato etiqueta="Fase / Grupo" valor={partido.fase || '—'} />
            <Dato etiqueta="Árbitro" valor={planilla.arbitroNombre || partido.arbitroNombre || '—'} />
          </div>
        </div>

        {/* Marcador. */}
        <div className="rounded-md border border-[hsl(273_20%_85%)] bg-[hsl(273_40%_97%)] px-3 py-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="text-right font-extrabold text-sm uppercase tracking-tight truncate">
            {partido.localNombre}
          </div>
          <div className="text-center shrink-0">
            <div className="font-mono font-extrabold text-2xl leading-none tabular-nums">
              {partido.walkover ? '6 - 0' : `${partido.golesLocal ?? 0} - ${partido.golesVisitante ?? 0}`}
            </div>
            {hayPenales && (
              <div className="text-[9px] font-bold text-[hsl(340_74%_27%)] mt-0.5">
                Penales {partido.penalesLocal} - {partido.penalesVisitante}
              </div>
            )}
            {partido.walkover && (
              <div className="text-[9px] font-bold text-[hsl(340_74%_27%)] mt-0.5">Ganado por W.O. (Art. 23)</div>
            )}
          </div>
          <div className="font-extrabold text-sm uppercase tracking-tight truncate">{partido.visitanteNombre}</div>
        </div>

        {/* Las dos nóminas, como en la planilla de papel. */}
        <div className="grid grid-cols-2 gap-3 items-start">
          <NominaImpresa
            nombre={partido.localNombre}
            color={colorLocal}
            jugadores={locales}
            goles={partido.walkover ? 0 : (partido.golesLocal ?? 0)}
          />
          <NominaImpresa
            nombre={partido.visitanteNombre}
            color={colorVisitante}
            jugadores={visitantes}
            goles={partido.walkover ? 0 : (partido.golesVisitante ?? 0)}
          />
        </div>

        {/* Firmas. */}
        <div className="grid grid-cols-4 gap-2 pt-7">
          <Firma titulo={`Delegado ${partido.localNombre}`} />
          <Firma titulo={`Delegado ${partido.visitanteNombre}`} />
          <Firma titulo="Árbitro" nombre={planilla.arbitroNombre || partido.arbitroNombre || undefined} />
          <Firma titulo="Oficial de mesa" nombre={planilla.mesa || partido.mesa || undefined} />
        </div>
      </div>

      <p className="text-[9px] text-[hsl(273_15%_50%)] text-center px-5 pb-3">
        Torneo Socorro Senior Master Plus 40 · A = amarillas, R = rojas, G = goles. Copia del acta para el
        delegado; los reclamos se presentan ante el Comité Organizador.
      </p>
    </div>
  );
}

/**
 * Imprime la planilla de UN partido desde la lista.
 *
 * Va aparte del componente de arriba porque la planilla no viene con la
 * lista de partidos: hay que pedirla por partido. Como no se puede llamar un
 * hook por fila, la página guarda cuál partido se va a imprimir y monta
 * esto; acá se pide la planilla y, apenas llega, se manda a imprimir.
 *
 * No se usa hooks/use-imprimir.ts porque ese prende el portal y cuenta los
 * 60 ms de una vez: acá primero hay que esperar a que llegue la planilla del
 * servidor, si no se imprimiría una hoja vacía.
 */
export function ImpresionPlanilla({
  partido,
  colorLocal,
  colorVisitante,
  onTerminado,
}: {
  partido: Partido;
  colorLocal?: string | null;
  colorVisitante?: string | null;
  onTerminado: () => void;
}) {
  const { data, isError } = useGetPlanilla(partido.id);

  useEffect(() => {
    if (isError) onTerminado();
  }, [isError, onTerminado]);

  useEffect(() => {
    if (!data) return;
    // El mismo respiro que usa hooks/use-imprimir.ts: darle a React el tick
    // que necesita para montar el portal antes de llamar a print().
    const id = window.setTimeout(() => {
      window.print();
      onTerminado();
    }, 60);
    return () => window.clearTimeout(id);
  }, [data, onTerminado]);

  if (!data) return null;

  return (
    <ImprimirPortal activo>
      <PlanillaImprimible
        partido={partido}
        planilla={data}
        colorLocal={colorLocal}
        colorVisitante={colorVisitante}
      />
    </ImprimirPortal>
  );
}
