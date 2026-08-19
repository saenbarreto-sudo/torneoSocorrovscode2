import { useEffect, useMemo, useState } from 'react';
import { useGetPlanilla, useSavePlanilla, useGetSanciones, type PlanillaJugador } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { extractErrorMessage } from '@/lib/api-errors';
import { Loader2 } from 'lucide-react';

/** Fila editable de la planilla, en memoria mientras la mesa la llena. */
type Fila = Pick<PlanillaJugador, 'jugadorId' | 'jugadorNombre' | 'equipoId' | 'nCarnet'> & {
  jugo: boolean;
  dorsal: string;
  titular: boolean;
  goles: number;
  amarillas: number;
  rojas: number;
  fechasSancion: number;
};

const PUNTOS_AMARILLA = 10;
const PUNTOS_ROJA = 20;

function NominaEquipo({
  titulo,
  filas,
  golesEquipo,
  fairPlay,
  readOnly,
  suspendidos,
  onChange,
}: {
  titulo: string;
  filas: Fila[];
  golesEquipo: number;
  fairPlay: number;
  readOnly: boolean;
  suspendidos: Set<number>;
  onChange: (jugadorId: number, cambios: Partial<Fila>) => void;
}) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="bg-sidebar text-sidebar-foreground px-3 py-2 flex items-center justify-between gap-2">
        <span className="font-bold truncate">{titulo}</span>
        <span className="flex items-center gap-3 text-xs shrink-0">
          <span title="Puntos de juego limpio (amarilla 10, roja 20)">FP {fairPlay}</span>
          <span className="font-mono font-bold text-lg leading-none">{golesEquipo}</span>
        </span>
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
            {filas.map((f) => (
              <tr key={f.jugadorId} className={`border-t ${f.jugo ? '' : 'opacity-50'}`}>
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={f.jugo}
                    disabled={readOnly}
                    onChange={(e) => onChange(f.jugadorId, { jugo: e.target.checked })}
                    aria-label={`${f.jugadorNombre} jugó`}
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
                  {suspendidos.has(f.jugadorId) && (
                    <span
                      className="ml-2 text-[10px] font-bold uppercase tracking-wide text-destructive"
                      title="Tiene fechas de sanción pendientes"
                    >
                      Sancionado
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
                    placeholder="0"
                    disabled={readOnly || !f.jugo}
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
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PlanillaPartido({
  partido,
  readOnly,
  onGuardado,
}: {
  partido: { id: number; localId: number; localNombre: string; visitanteId: number; visitanteNombre: string };
  readOnly: boolean;
  onGuardado?: () => void;
}) {
  const { toast } = useToast();
  const { data, isLoading } = useGetPlanilla(partido.id);
  const { data: sanciones } = useGetSanciones();
  // Jugadores que todavía deben cumplir fechas: no deberían alinearse.
  const suspendidos = new Set(
    (sanciones ?? []).filter((s) => s.fechasPendientes > 0).map((s) => s.jugadorId),
  );
  const saveMutation = useSavePlanilla(partido.id);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [arbitro, setArbitro] = useState('');
  const [mesa, setMesa] = useState('');

  useEffect(() => {
    if (!data) return;
    setArbitro(data.arbitro ?? '');
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
      })),
    );
  }, [data]);

  const actualizar = (jugadorId: number, cambios: Partial<Fila>) => {
    setFilas((prev) =>
      prev.map((f) => {
        if (f.jugadorId !== jugadorId) return f;
        const siguiente = { ...f, ...cambios };
        // Si se desmarca "jugó", se limpia todo lo demás de ese jugador.
        if (cambios.jugo === false) {
          return { ...siguiente, goles: 0, amarillas: 0, rojas: 0, fechasSancion: 0, dorsal: '' };
        }
        // Dos amarillas implican expulsión.
        if (cambios.amarillas === 2) siguiente.rojas = 1;
        if (siguiente.rojas === 0) siguiente.fechasSancion = 0;
        return siguiente;
      }),
    );
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

  const alineadosSancionados = filas.filter((f) => f.jugo && suspendidos.has(f.jugadorId));

  const guardar = () => {
    if (alineadosSancionados.length > 0) {
      const nombres = alineadosSancionados.map((f) => f.jugadorNombre).join(', ');
      const seguir = window.confirm(
        `Estos jugadores tienen fechas de sanción pendientes: ${nombres}.\n\n` +
          '¿Confirmas que aun así estuvieron en el partido?',
      );
      if (!seguir) return;
    }
    saveMutation.mutate(
      {
        arbitro,
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
            Nombre del árbitro
          </label>
          <Input
            id="planilla-arbitro"
            value={arbitro}
            disabled={readOnly}
            placeholder="Quién dirigió el partido"
            onChange={(e) => setArbitro(e.target.value)}
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

      <div className="flex items-center justify-center gap-4 py-2">
        <span className="font-mono font-bold text-3xl tabular-nums">{resLocal.goles}</span>
        <span className="text-muted-foreground text-sm">marcador calculado</span>
        <span className="font-mono font-bold text-3xl tabular-nums">{resVisitante.goles}</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <NominaEquipo
          titulo={partido.localNombre}
          filas={locales}
          golesEquipo={resLocal.goles}
          fairPlay={resLocal.fairPlay}
          readOnly={readOnly}
          suspendidos={suspendidos}
          onChange={actualizar}
        />
        <NominaEquipo
          titulo={partido.visitanteNombre}
          filas={visitantes}
          golesEquipo={resVisitante.goles}
          fairPlay={resVisitante.fairPlay}
          readOnly={readOnly}
          suspendidos={suspendidos}
          onChange={actualizar}
        />
      </div>

      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={guardar} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Guardar planilla y resultado
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        El marcador sale de los goles de cada jugador, no se escribe a mano. Dos amarillas marcan
        automáticamente la roja. Las tarjetas ya pagadas no se borran al volver a guardar.
      </p>
    </div>
  );
}
