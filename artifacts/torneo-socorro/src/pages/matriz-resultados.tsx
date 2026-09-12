import { useMemo, useState } from 'react';
import { useGetPosiciones, useGetFases, useGetPartidos, type Partido } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Grid3x3, Printer } from 'lucide-react';
import { ImprimirPortal } from '@/components/imprimir-portal';
import { TablaImprimible } from '@/components/tabla-imprimible';
import { useImprimir } from '@/hooks/use-imprimir';
import { useAuth, puedeImprimir } from '@/lib/auth';

/**
 * La matriz de resultados: quién le ganó a quién, de un vistazo, sin tener
 * que buscar partido por partido. Filas = local, columnas = visitante,
 * igual que la venía armando Sabik a mano en Excel.
 *
 * Los equipos se toman de Posiciones (mismo orden, ya viene por posición) y
 * las columnas se identifican por ese mismo número en vez del nombre
 * completo, para que la tabla quepa aunque haya muchos equipos — el nombre
 * completo ya está a la izquierda, en la fila de ese mismo equipo.
 */

const TABLA_GENERAL = '__general__';
const FASES_TEMPORADA_REGULAR = ['Primera vuelta', 'Segunda vuelta'];

function perteneceATablaGeneral(p: Partido): boolean {
  return p.fase == null || FASES_TEMPORADA_REGULAR.includes(p.fase);
}

interface Celda {
  partido: Partido | null;
}

function claseResultado(p: Partido): string {
  if (!p.jugado) return 'text-muted-foreground';
  if (p.golesLocal === p.golesVisitante) return 'bg-muted/50';
  const ganaLocal = (p.golesLocal ?? 0) > (p.golesVisitante ?? 0);
  return ganaLocal
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
    : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400';
}

function textoResultado(p: Partido): string {
  return p.jugado ? `${p.golesLocal}-${p.golesVisitante}` : 'vs';
}

export default function MatrizResultados({ embebido = false }: { embebido?: boolean } = {}) {
  const [fase, setFase] = useState<string>(TABLA_GENERAL);
  const esTablaGeneral = fase === TABLA_GENERAL;
  const { data: fases } = useGetFases();
  const { data: posiciones, isLoading } = useGetPosiciones(esTablaGeneral ? undefined : { fase });
  const { data: partidos } = useGetPartidos();
  const { imprimiendo, imprimir } = useImprimir();

  const equipos = useMemo(
    () => (posiciones ?? []).slice().sort((a, b) => a.posicion - b.posicion),
    [posiciones],
  );

  // Un solo cruce por par ordenado (local → visitante): si por algún motivo
  // hay más de uno, gana el más reciente.
  const cruces = useMemo(() => {
    const mapa = new Map<string, Partido>();
    const deLaFase = (partidos ?? []).filter((p) => (esTablaGeneral ? perteneceATablaGeneral(p) : p.fase === fase));
    for (const p of [...deLaFase].sort((a, b) => a.id - b.id)) {
      mapa.set(`${p.localId}-${p.visitanteId}`, p);
    }
    return mapa;
  }, [partidos, fase, esTablaGeneral]);

  const celda = (localId: number, visitanteId: number): Celda => ({
    partido: cruces.get(`${localId}-${visitanteId}`) ?? null,
  });

  const nombreFase = esTablaGeneral ? 'Tabla general' : fase;
  // El invitado consulta, no imprime (ver puedeImprimir en lib/auth.tsx).
  const { role } = useAuth();
  const botonImprimir = puedeImprimir(role) ? (
    <Button variant="ghost" size="icon" onClick={imprimir} aria-label="Imprimir matriz de resultados">
      <Printer className="h-4 w-4" />
    </Button>
  ) : null;

  return (
    <div className="space-y-4">
      {embebido ? (
        <div className="flex items-center gap-2">
          <Grid3x3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold tracking-tight">Matriz de resultados</h2>
          <span className="ml-auto">{botonImprimir}</span>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 text-primary rounded-lg">
            <Grid3x3 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Matriz de resultados</h1>
            <p className="text-muted-foreground mt-1">Quién le ganó a quién</p>
          </div>
          <span className="ml-auto">{botonImprimir}</span>
        </div>
      )}

      {fases && fases.length > 0 && (
        <Tabs value={fase} onValueChange={setFase}>
          <TabsList>
            <TabsTrigger value={TABLA_GENERAL}>Tabla general</TabsTrigger>
            {fases.map((f) => (
              <TabsTrigger key={f.nombre} value={f.nombre}>{f.nombre}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">Cargando...</div>
          ) : equipos.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No hay equipos en esta fase todavía.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-sidebar text-sidebar-foreground hover:bg-sidebar">
                  <TableHead className="sticky left-0 bg-sidebar text-sidebar-foreground z-10 whitespace-nowrap">
                    Local \ Visitante
                  </TableHead>
                  {equipos.map((eq) => (
                    <TableHead
                      key={eq.equipoId}
                      className="text-center font-mono text-sidebar-foreground w-12"
                      title={eq.equipoNombre}
                    >
                      {eq.posicion}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {equipos.map((fila) => (
                  <TableRow key={fila.equipoId}>
                    <TableCell className="sticky left-0 bg-background z-10 font-bold whitespace-nowrap">
                      <span className="text-muted-foreground font-mono mr-1.5">{fila.posicion}</span>
                      {fila.equipoNombre}
                    </TableCell>
                    {equipos.map((col) => {
                      if (col.equipoId === fila.equipoId) {
                        return (
                          <TableCell key={col.equipoId} className="text-center bg-muted/30 text-muted-foreground">
                            ✕
                          </TableCell>
                        );
                      }
                      const { partido } = celda(fila.equipoId, col.equipoId);
                      if (!partido) {
                        return (
                          <TableCell key={col.equipoId} className="text-center text-muted-foreground/50 font-mono">
                            —
                          </TableCell>
                        );
                      }
                      return (
                        <TableCell
                          key={col.equipoId}
                          className={`text-center font-mono text-xs ${claseResultado(partido)}`}
                        >
                          {textoResultado(partido)}
                          {partido.walkover && (
                            <div className="text-[9px] font-semibold text-amber-600 leading-none">W.O.</div>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Cada fila es el equipo jugando de local; cada columna, el número de posición del rival como visitante.
      </p>

      <ImprimirPortal activo={imprimiendo}>
        <TablaImprimible
          titulo="MATRIZ DE RESULTADOS"
          subtitulo={nombreFase}
          columnas={[
            { encabezado: 'Local \\ Visitante' },
            ...equipos.map((eq) => ({ encabezado: String(eq.posicion), alineacion: 'centro' as const })),
          ]}
          filas={equipos.map((fila) => ({
            clave: fila.equipoId,
            celdas: [
              `${fila.posicion}. ${fila.equipoNombre}`,
              ...equipos.map((col) => {
                if (col.equipoId === fila.equipoId) return '✕';
                const { partido } = celda(fila.equipoId, col.equipoId);
                if (!partido) return '—';
                return partido.walkover ? `${textoResultado(partido)} (w.o.)` : textoResultado(partido);
              }),
            ],
          }))}
          nota="Cada fila es el equipo jugando de local; el número de columna es la posición del rival."
        />
      </ImprimirPortal>
    </div>
  );
}
