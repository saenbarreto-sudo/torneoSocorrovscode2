import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  useGetFases,
  getGetPartidosQueryOptions,
  getGetPosicionesQueryOptions,
  type Partido,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { GitFork, Printer } from 'lucide-react';
import { ImprimirPortal } from '@/components/imprimir-portal';
import { useImprimir } from '@/hooks/use-imprimir';
import { CuadroFinal, type GrupoDelCuadro, type RondaDelCuadro } from '@/components/cuadro-final';

/** La casilla del 3er puesto se dibuja aparte, no como una ronda más de la llave. */
const FASE_TERCER_PUESTO = '3er puesto';

/**
 * Arma el cuadro de la fase final con lo que ya hay cargado: toma del
 * catálogo de fases las de tipo "grupos" (para la columna de la izquierda) y
 * las de tipo "eliminación" (una columna por ronda, en el orden en que se
 * crearon), y les pide sus partidos.
 *
 * Si el torneo todavía no llegó a la eliminación, no muestra nada — el
 * cuadro aparece solo cuando hay algo que mostrar. Lo mismo con el 3er
 * puesto: sale únicamente si ese partido existe.
 */
export function CuadroFinalSeccion() {
  const { data: fases } = useGetFases();
  const { imprimiendo, imprimir } = useImprimir();

  const fasesGrupos = (fases ?? []).filter((f) => f.tipo === 'grupos');
  const fasesEliminacion = (fases ?? []).filter((f) => f.tipo === 'eliminacion' && f.nombre !== FASE_TERCER_PUESTO);
  const hayTercerPuesto = (fases ?? []).some((f) => f.nombre === FASE_TERCER_PUESTO);

  const tablasGrupos = useQueries({
    queries: fasesGrupos.map((f) => getGetPosicionesQueryOptions({ fase: f.nombre })),
  });

  const nombresConPartidos = [
    ...fasesEliminacion.map((f) => f.nombre),
    ...(hayTercerPuesto ? [FASE_TERCER_PUESTO] : []),
  ];
  const { data: todosPartidos } = useQuery<Partido[]>({
    ...getGetPartidosQueryOptions(),
    enabled: nombresConPartidos.length > 0,
  });

  const grupos: GrupoDelCuadro[] = fasesGrupos.map((f, i) => ({
    nombre: f.nombre,
    equipos: (tablasGrupos[i]?.data ?? []).map((p) => ({
      equipoId: p.equipoId,
      equipoNombre: p.equipoNombre,
      posicion: p.posicion,
    })),
  }));

  const rondas: RondaDelCuadro[] = useMemo(() => {
    return fasesEliminacion.map((f) => {
      const partidos = (todosPartidos ?? [])
        .filter((p) => p.fase === f.nombre)
        .sort((a, b) => a.id - b.id); // el orden en que los generó la siembra
      const fechas = partidos.map((p) => p.fecha).filter((x): x is string => !!x).sort();
      return { nombre: f.nombre, fecha: fechas[0] ?? null, partidos };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todosPartidos, fasesEliminacion.map((f) => f.nombre).join('|')]);

  const tercerPuesto = (todosPartidos ?? []).find((p) => p.fase === FASE_TERCER_PUESTO) ?? null;

  if (fasesEliminacion.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <GitFork className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold tracking-tight">Cuadro final</h2>
        <span className="ml-auto">
          <Button variant="ghost" size="icon" onClick={imprimir} aria-label="Imprimir cuadro final">
            <Printer className="h-4 w-4" />
          </Button>
        </span>
      </div>

      <CuadroFinal grupos={grupos} rondas={rondas} tercerPuesto={tercerPuesto} />

      <ImprimirPortal activo={imprimiendo}>
        <CuadroFinal grupos={grupos} rondas={rondas} tercerPuesto={tercerPuesto} />
      </ImprimirPortal>
    </div>
  );
}
