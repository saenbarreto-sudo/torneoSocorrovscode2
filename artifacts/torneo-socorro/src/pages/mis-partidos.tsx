import { useMemo } from 'react';
import { useGetMiEquipo, useGetPartidos, type Partido } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Swords } from 'lucide-react';
import { formatFecha, formatHora12 } from '@/lib/utils';

/** Cómo le fue a mi equipo en un partido ya jugado. */
function resultado(p: Partido, miEquipoId: number): 'G' | 'E' | 'P' | null {
  if (!p.jugado || p.golesLocal == null || p.golesVisitante == null) return null;
  const soyLocal = p.localId === miEquipoId;
  const mios = soyLocal ? p.golesLocal : p.golesVisitante;
  const suyos = soyLocal ? p.golesVisitante : p.golesLocal;
  if (mios > suyos) return 'G';
  if (mios < suyos) return 'P';
  return 'E';
}

const ETIQUETA: Record<'G' | 'E' | 'P', { texto: string; variante: 'success' | 'secondary' | 'destructive' }> = {
  G: { texto: 'Ganado', variante: 'success' },
  E: { texto: 'Empatado', variante: 'secondary' },
  P: { texto: 'Perdido', variante: 'destructive' },
};

/**
 * El calendario y los resultados del equipo del delegado. Los partidos son
 * públicos (están en la cartelera), así que se piden a /partidos y se
 * filtran a los suyos acá.
 */
export default function MisPartidos() {
  const { data: mio } = useGetMiEquipo();
  const { data: partidos } = useGetPartidos();
  const miEquipoId = mio?.equipo.id;

  const mios = useMemo(() => {
    if (!partidos || miEquipoId == null) return [];
    return partidos
      .filter((p) => p.localId === miEquipoId || p.visitanteId === miEquipoId)
      .sort((a, b) => (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999') || a.semana - b.semana);
  }, [partidos, miEquipoId]);

  const jugados = mios.filter((p) => p.jugado);
  const porJugar = mios.filter((p) => !p.jugado);

  const balance = jugados.reduce(
    (acc, p) => {
      const r = resultado(p, miEquipoId!);
      if (r === 'G') acc.g++;
      else if (r === 'E') acc.e++;
      else if (r === 'P') acc.p++;
      return acc;
    },
    { g: 0, e: 0, p: 0 },
  );

  const tabla = (lista: Partido[], vacio: string) => (
    <div className="overflow-x-auto">
      <Table variant="torneo">
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Hora</TableHead>
            <TableHead>Rival</TableHead>
            <TableHead className="text-center">Condición</TableHead>
            <TableHead>Fase</TableHead>
            <TableHead className="text-center">Marcador</TableHead>
            <TableHead className="text-center">Resultado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lista.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">{vacio}</TableCell>
            </TableRow>
          ) : (
            lista.map((p) => {
              const soyLocal = p.localId === miEquipoId;
              const rival = soyLocal ? p.visitanteNombre : p.localNombre;
              const r = resultado(p, miEquipoId!);
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-mono whitespace-nowrap">{p.fecha ? formatFecha(p.fecha) : '—'}</TableCell>
                  <TableCell className="font-mono whitespace-nowrap">{p.hora ? formatHora12(p.hora) : '—'}</TableCell>
                  <TableCell className="font-bold">{rival}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="font-normal">{soyLocal ? 'Local' : 'Visitante'}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.fase || '—'}</TableCell>
                  <TableCell className="text-center font-mono tabular-nums font-bold">
                    {p.jugado && p.golesLocal != null
                      ? `${soyLocal ? p.golesLocal : p.golesVisitante} - ${soyLocal ? p.golesVisitante : p.golesLocal}`
                      : '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    {r ? <Badge variant={ETIQUETA[r].variante}>{ETIQUETA[r].texto}</Badge> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 text-primary rounded-lg">
          <Swords className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Mis partidos</h1>
          <p className="text-muted-foreground mt-1">
            {jugados.length > 0
              ? `${balance.g} ganados · ${balance.e} empatados · ${balance.p} perdidos`
              : 'El calendario y los resultados de tu equipo'}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-bold">Lo que viene</h2>
          </div>
          {tabla(porJugar, 'No tienes partidos programados por ahora.')}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-bold">Lo jugado</h2>
          </div>
          {tabla([...jugados].reverse(), 'Todavía no has jugado ningún partido.')}
        </CardContent>
      </Card>
    </div>
  );
}
