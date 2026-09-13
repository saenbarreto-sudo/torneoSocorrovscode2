import { useEffect, useMemo, useState } from 'react';
import { useGetPlanilla, useSavePlanilla, type PlanillaJugador } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { extractErrorMessage } from '@/lib/api-errors';
import { Loader2, Search, X } from 'lucide-react';
import { SelectorArbitro } from '@/components/selector-arbitro';
import { AbonosMesa } from '@/components/abonos-mesa';

/** Fila editable de la planilla, en memoria mientras la mesa la llena. */
type Fila = Pick<PlanillaJugador, 'jugadorId' | 'jugadorNombre' | 'equipoId' | 'nCarnet'> & {
  jugo: boolean;
  dorsal: string;
  titular: boolean;
  goles: number;
  amarillas: number;
  rojas: number;
  fechasSancion: number;
  /** Fechas de sanción sin cumplir a la fecha de este partido. >0 = no puede jugar. */
  fechasPendientes: number;
};

const PUNTOS_AMARILLA = 10;
const PUNTOS_ROJA = 20;
const MINIMO_JUGADORES = 6;
/** El formato del torneo: 9 en cancha y hasta 11 en la banca. */
const TITULARES = 9;
const MAXIMO_SUPLENTES = 11;

/**
 * Texto comparable: sin tildes, sin mayúsculas y sin espacios de sobra.
 *
 * Los nombres del torneo vienen del carné y traen tildes y ñ ("Beleño",
 * "Zuñiga", "Viáña"). Sin normalizar, buscar "belenio" o "beleno" no
 * encuentra nada y la mesa termina bajando a mano por una lista de 58.
 */
function paraBuscar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** true si el jugador coincide con lo buscado, por nombre o por carné. */
function coincide(fila: Fila, busqueda: string): boolean {
  const q = paraBuscar(busqueda);
  if (!q) return true;
  if (paraBuscar(fila.jugadorNombre).includes(q)) return true;
  // El carné se busca por lo que empieza: escribir "31" tiene que traer el
  // 315 y el 312, no todos los que lleven un 31 en la mitad.
  return fila.nCarnet != null && String(fila.nCarnet).startsWith(q);
}

function NominaEquipo({
  titulo,
  filas,
  golesEquipo,
  fairPlay,
  readOnly,
  permiteIncompleto,
  onChange,
}: {
  titulo: string;
  filas: Fila[];
  golesEquipo: number;
  fairPlay: number;
  readOnly: boolean;
  /** En un W.O. el equipo que no se presentó puede quedar con menos de 6. */
  permiteIncompleto: boolean;
  onChange: (jugadorId: number, cambios: Partial<Fila>) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [soloMarcados, setSoloMarcados] = useState(false);

  // Los contadores se calculan SIEMPRE sobre la nómina completa: el
  // buscador solo esconde filas, no cambia quién está alineado.
  const alineados = filas.filter((f) => f.jugo);
  const titulares = alineados.filter((f) => f.titular).length;
  const suplentes = alineados.length - titulares;
  const faltan = !permiteIncompleto && alineados.length < MINIMO_JUGADORES;

  const visibles = filas.filter((f) => (soloMarcados ? f.jugo : true) && coincide(f, busqueda));
  const escondidos = filas.length - visibles.length;

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="bg-sidebar text-sidebar-foreground px-3 py-2 flex items-center justify-between gap-2">
        <span className="font-bold truncate">{titulo}</span>
        <span className="flex items-center gap-3 text-xs shrink-0">
          <span
            className={
              faltan || titulares > TITULARES
                ? 'font-bold text-destructive'
                : 'text-sidebar-foreground/70'
            }
            title={`Titulares en cancha (son ${TITULARES})`}
          >
            Tit. {titulares}/{TITULARES}
          </span>
          <span
            className={suplentes > MAXIMO_SUPLENTES ? 'font-bold text-destructive' : 'text-sidebar-foreground/70'}
            title={`Suplentes en la banca (hasta ${MAXIMO_SUPLENTES})`}
          >
            Sup. {suplentes}/{MAXIMO_SUPLENTES}
          </span>
          <span title="Puntos de juego limpio (amarilla 10, roja 20)">FP {fairPlay}</span>
          <span className="font-mono font-bold text-lg leading-none">{golesEquipo}</span>
        </span>
      </div>

      {/* Buscador propio de cada equipo: las nóminas llegan a pasar de 50
          jugadores, y en la mesa se va llamando uno por uno por el carné. */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="h-8 pl-7 pr-7 text-sm"
            placeholder="Buscar por nombre o carné"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label={`Buscar jugador de ${titulo}`}
          />
          {busqueda && (
            <button
              type="button"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setBusqueda('')}
              aria-label="Limpiar la búsqueda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSoloMarcados((v) => !v)}
          aria-pressed={soloMarcados}
          className={`shrink-0 rounded border px-2 py-1 text-xs font-medium transition-colors ${
            soloMarcados ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
          }`}
          title="Ver solo los que ya marcaste como que jugaron"
        >
          Solo los {alineados.length} marcados
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-2 text-left font-bold">Jugó</th>
              <th className="p-2 text-left font-bold">N°</th>
              <th className="p-2 text-left font-bold">Jugador</th>
              <th className="p-2 text-center font-bold">Tit.</th>
              <th className="p-2 text-center font-bold" title="Amarillas (máx. 2)">A</th>
              <th className="p-2 text-center font-bold" title="Roja">R</th>
              <th className="p-2 text-center font-bold" title="Goles">G</th>
              <th className="p-2 text-center font-bold" title="Fechas de suspensión por la roja">Fechas</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.jugadorId} className={`border-t ${f.jugo ? '' : 'opacity-50'}`}>
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={f.jugo}
                    // Un sancionado no se puede marcar: la casilla queda
                    // bloqueada hasta que cumpla sus fechas.
                    disabled={readOnly || f.fechasPendientes > 0}
                    onChange={(e) => onChange(f.jugadorId, { jugo: e.target.checked })}
                    aria-label={`${f.jugadorNombre} jugó`}
                    title={
                      f.fechasPendientes > 0
                        ? `Sancionado: le ${f.fechasPendientes === 1 ? 'falta 1 fecha' : `faltan ${f.fechasPendientes} fechas`} por cumplir`
                        : undefined
                    }
                  />
                </td>
                <td className="p-2">
                  <Input
                    className="h-8 w-16"
                    inputMode="numeric"
                    value={f.dorsal}
                    disabled={readOnly || !f.jugo}
                    onChange={(e) => onChange(f.jugadorId, { dorsal: e.target.value })}
                    aria-label={`Dorsal de ${f.jugadorNombre}`}
                  />
                </td>
                <td className="p-2">
                  <span className="font-medium">{f.jugadorNombre}</span>
                  {f.fechasPendientes > 0 && (
                    <span
                      className="ml-2 text-[10px] font-bold uppercase tracking-wide text-destructive"
                      title="No puede jugar hasta cumplir su sanción"
                    >
                      Sancionado · {f.fechasPendientes === 1 ? 'falta 1 fecha' : `faltan ${f.fechasPendientes} fechas`}
                    </span>
                  )}
                  {f.nCarnet != null && (
                    <span className="text-xs text-muted-foreground ml-2 font-mono">#{f.nCarnet}</span>
                  )}
                </td>
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    checked={f.titular}
                    disabled={readOnly || !f.jugo}
                    onChange={(e) => onChange(f.jugadorId, { titular: e.target.checked })}
                    aria-label={`${f.jugadorNombre} titular`}
                  />
                </td>
                <td className="p-2 text-center">
                  <select
                    className="h-8 rounded border bg-background px-1 text-sm"
                    value={f.amarillas}
                    disabled={readOnly || !f.jugo}
                    onChange={(e) => onChange(f.jugadorId, { amarillas: Number(e.target.value) })}
                    aria-label={`Amarillas de ${f.jugadorNombre}`}
                  >
                    <option value={0}>-</option>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                  </select>
                </td>
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    checked={f.rojas > 0}
                    disabled={readOnly || !f.jugo}
                    onChange={(e) => onChange(f.jugadorId, { rojas: e.target.checked ? 1 : 0 })}
                    aria-label={`Roja de ${f.jugadorNombre}`}
                  />
                </td>
                <td className="p-2 text-center">
                  <Input
                    className="h-8 w-16 text-center font-mono"
                    inputMode="numeric"
                    value={f.goles === 0 ? '' : f.goles}
                    placeholder={permiteIncompleto ? '—' : '0'}
                    disabled={readOnly || !f.jugo || permiteIncompleto}
                    onChange={(e) => onChange(f.jugadorId, { goles: Number(e.target.value) || 0 })}
                    aria-label={`Goles de ${f.jugadorNombre}`}
                  />
                </td>
                <td className="p-2 text-center">
                  {f.rojas > 0 ? (
                    <Input
                      className="h-8 w-16 text-center font-mono"
                      inputMode="numeric"
                      value={f.fechasSancion === 0 ? '' : f.fechasSancion}
                      placeholder="0"
                      disabled={readOnly}
                      onChange={(e) => onChange(f.jugadorId, { fechasSancion: Number(e.target.value) || 0 })}
                      aria-label={`Fechas de sanción de ${f.jugadorNombre}`}
                    />
                  ) : (
                    <span className="text-muted-foreground text-xs">-</span>
                  )}
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground text-sm">
                  Este equipo no tiene jugadores registrados.
                </td>
              </tr>
            )}
            {filas.length > 0 && visibles.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground text-sm">
                  {soloMarcados && alineados.length === 0
                    ? 'Todavía no has marcado a nadie de este equipo.'
                    : `Ningún jugador de ${titulo} coincide con “${busqueda}”.`}
                </td>
              </tr>
            )}
            {/* Que no parezca que el equipo se quedó sin jugadores: se dice
                cuántos está escondiendo el filtro. */}
            {escondidos > 0 && visibles.length > 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-1.5 text-center text-xs text-muted-foreground bg-muted/20 border-t">
                  {escondidos === 1 ? '1 jugador oculto por el filtro' : `${escondidos} jugadores ocultos por el filtro`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PlanillaPartido({
  partido,
  readOnly,
  esWalkover = false,
  onGuardado,
}: {
  partido: {
    id: number;
    semana: number;
    fecha?: string | null;
    localId: number;
    localNombre: string;
    visitanteId: number;
    visitanteNombre: string;
  };
  readOnly: boolean;
  /** Partido ganado por W.O.: se registra quién se presentó, sin goles. */
  esWalkover?: boolean;
  onGuardado?: () => void;
}) {
  const { toast } = useToast();
  const { data, isLoading } = useGetPlanilla(partido.id);
  const saveMutation = useSavePlanilla(partido.id);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [arbitroId, setArbitroId] = useState<number | null>(null);
  const [mesa, setMesa] = useState('');

  useEffect(() => {
    if (!data) return;
    setArbitroId(data.arbitroId ?? null);
    setMesa(data.mesa ?? '');
    setFilas(
      data.jugadores.map((j) => ({
        jugadorId: j.jugadorId,
        jugadorNombre: j.jugadorNombre,
        equipoId: j.equipoId,
        nCarnet: j.nCarnet,
        jugo: j.jugo,
        dorsal: j.dorsal != null ? String(j.dorsal) : '',
        titular: j.titular,
        goles: j.goles,
        amarillas: j.amarillas,
        rojas: j.rojas,
        fechasSancion: j.fechasSancion ?? 0,
        fechasPendientes: j.fechasPendientes ?? 0,
      })),
    );
  }, [data]);

  const actualizar = (jugadorId: number, cambios: Partial<Fila>) => {
    setFilas((prev) => {
      const yo = prev.find((f) => f.jugadorId === jugadorId);
      // Al marcar "jugó", el jugador entra de titular mientras su equipo no
      // complete los 9 de cancha; del décimo en adelante entra a la banca.
      // Así la mesa solo va marcando quién jugó, en orden, sin tener que
      // acordarse de destildar el "Tit." — y si hace falta, igual lo puede
      // cambiar a mano.
      let titularAutomatico: boolean | undefined;
      if (cambios.jugo === true && yo) {
        const titularesDelEquipo = prev.filter(
          (f) => f.equipoId === yo.equipoId && f.jugo && f.titular && f.jugadorId !== jugadorId,
        ).length;
        titularAutomatico = titularesDelEquipo < TITULARES;
      }
      return prev.map((f) => {
        if (f.jugadorId !== jugadorId) return f;
        const siguiente = { ...f, ...cambios };
        // Si se desmarca "jugó", se limpia todo lo demás de ese jugador.
        if (cambios.jugo === false) {
          return { ...siguiente, goles: 0, amarillas: 0, rojas: 0, fechasSancion: 0, dorsal: '' };
        }
        if (titularAutomatico !== undefined) siguiente.titular = titularAutomatico;
        // Dos amarillas implican expulsión.
        if (cambios.amarillas === 2) siguiente.rojas = 1;
        if (siguiente.rojas === 0) siguiente.fechasSancion = 0;
        return siguiente;
      });
    });
  };

  const locales = useMemo(() => filas.filter((f) => f.equipoId === partido.localId), [filas, partido.localId]);
  const visitantes = useMemo(
    () => filas.filter((f) => f.equipoId === partido.visitanteId),
    [filas, partido.visitanteId],
  );

  const resumen = (lista: Fila[]) => ({
    goles: lista.reduce((s, f) => s + (f.jugo ? f.goles : 0), 0),
    fairPlay: lista.reduce(
      (s, f) => s + (f.jugo ? f.amarillas * PUNTOS_AMARILLA + f.rojas * PUNTOS_ROJA : 0),
      0,
    ),
  });

  const resLocal = resumen(locales);
  const resVisitante = resumen(visitantes);

  const alineadosSancionados = filas.filter((f) => f.jugo && f.fechasPendientes > 0);

  const jugoLocal = locales.filter((f) => f.jugo).length;
  const jugoVisitante = visitantes.filter((f) => f.jugo).length;
  // En un W.O. justamente uno de los dos no completó: la planilla existe
  // para dejarlo por escrito, así que ahí el mínimo no bloquea.
  const faltanJugadores = !esWalkover && (jugoLocal < MINIMO_JUGADORES || jugoVisitante < MINIMO_JUGADORES);
  // A quién le toca FOFI por no completar los 6 (Art. del reglamento).
  const conFofi = [
    ...(jugoLocal < MINIMO_JUGADORES ? [{ nombre: partido.localNombre, cuantos: jugoLocal }] : []),
    ...(jugoVisitante < MINIMO_JUGADORES ? [{ nombre: partido.visitanteNombre, cuantos: jugoVisitante }] : []),
  ];

  const guardar = () => {
    if (faltanJugadores) {
      const partes: string[] = [];
      if (jugoLocal < MINIMO_JUGADORES) {
        partes.push(`${partido.localNombre} le faltan ${MINIMO_JUGADORES - jugoLocal}`);
      }
      if (jugoVisitante < MINIMO_JUGADORES) {
        partes.push(`${partido.visitanteNombre} le faltan ${MINIMO_JUGADORES - jugoVisitante}`);
      }
      toast({
        title: 'Faltan jugadores para poder guardar',
        description: `Cada equipo necesita al menos ${MINIMO_JUGADORES} jugadores marcados como "Jugó". A ${partes.join(', y a ')}.`,
        variant: 'destructive',
      });
      return;
    }
    if (alineadosSancionados.length > 0) {
      const detalle = alineadosSancionados
        .map(
          (f) =>
            `${f.jugadorNombre} (le ${f.fechasPendientes === 1 ? 'falta 1 fecha' : `faltan ${f.fechasPendientes} fechas`})`,
        )
        .join(', ');
      toast({
        title: 'Hay jugadores sancionados en la planilla',
        description: `No se puede guardar con ${detalle}. Si la sanción está mal, corrige las fechas de la roja en Amonestados.`,
        variant: 'destructive',
      });
      return;
    }
    saveMutation.mutate(
      {
        arbitroId,
        mesa,
        jugadores: filas.map((f) => ({
          jugadorId: f.jugadorId,
          jugo: f.jugo,
          dorsal: f.dorsal ? Number(f.dorsal) : null,
          titular: f.titular,
          goles: f.goles,
          amarillas: f.amarillas,
          rojas: f.rojas,
          fechasSancion: f.fechasSancion,
        })),
      },
      {
        onSuccess: () => {
          toast({
            title: 'Planilla guardada',
            description: `Marcador ${resLocal.goles} - ${resVisitante.goles}, calculado con los goles registrados.`,
          });
          onGuardado?.();
        },
        onError: (err) =>
          toast({ title: 'No se pudo guardar', description: extractErrorMessage(err), variant: 'destructive' }),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="py-10 text-center text-muted-foreground text-sm">
        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
        Cargando nómina de los equipos...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3">
        <div className="space-y-1">
          <label htmlFor="planilla-arbitro" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Árbitro
          </label>
          <SelectorArbitro
            id="planilla-arbitro"
            value={arbitroId}
            onChange={setArbitroId}
            disabled={readOnly}
            placeholder="Quién dirigió el partido"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="planilla-mesa" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Nombre de la mesa
          </label>
          <Input
            id="planilla-mesa"
            value={mesa}
            disabled={readOnly}
            placeholder="Quién llenó la planilla"
            onChange={(e) => setMesa(e.target.value)}
          />
        </div>
      </div>

      {esWalkover ? (
        <div className="rounded-lg border-2 border-amber-500/40 bg-amber-500/5 px-3 py-2 text-center">
          <p className="text-sm font-bold">Partido ganado por W.O. · marcador oficial 6-0 (Art. 23)</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Marca quién se presentó de cada equipo: al que no complete {MINIMO_JUGADORES} le corresponde FOFI, y al
            que sí completó no. El marcador no se toca y no se registran goleadores.
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-4 py-2">
          <span className="font-mono font-bold text-3xl tabular-nums">{resLocal.goles}</span>
          <span className="text-muted-foreground text-sm">marcador calculado</span>
          <span className="font-mono font-bold text-3xl tabular-nums">{resVisitante.goles}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <NominaEquipo
          titulo={partido.localNombre}
          filas={locales}
          golesEquipo={resLocal.goles}
          fairPlay={resLocal.fairPlay}
          readOnly={readOnly}
          permiteIncompleto={esWalkover}
          onChange={actualizar}
        />
        <NominaEquipo
          titulo={partido.visitanteNombre}
          filas={visitantes}
          golesEquipo={resVisitante.goles}
          fairPlay={resVisitante.fairPlay}
          readOnly={readOnly}
          permiteIncompleto={esWalkover}
          onChange={actualizar}
        />
      </div>

      {/* A quién le toca FOFI: se avisa, no se cobra solo. El cobro se hace
          abajo, en el dato financiero, para que quede su recibo. */}
      {conFofi.length > 0 && (
        <div className="rounded-lg border-2 border-destructive/40 bg-destructive/5 px-3 py-2">
          <p className="text-sm font-bold text-destructive">
            {conFofi.length === 1 ? 'Este equipo no completó los 6:' : 'Estos equipos no completaron los 6:'}{' '}
            {conFofi.map((e) => `${e.nombre} (${e.cuantos})`).join(' y ')}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Le corresponde FOFI. Se puede cobrar aquí mismo, abajo, eligiendo el concepto FOFI.
          </p>
        </div>
      )}

      <AbonosMesa partido={partido} readOnly={readOnly} />

      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={guardar} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Guardar planilla y resultado
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        El marcador sale de los goles de cada jugador, no se escribe a mano. Los primeros {TITULARES} que marques
        entran de titulares y del décimo en adelante van a la banca (hasta {MAXIMO_SUPLENTES}); igual lo puedes
        cambiar a mano. Dos amarillas marcan automáticamente la roja. Las tarjetas ya pagadas no se borran al
        volver a guardar.
      </p>
    </div>
  );
}
