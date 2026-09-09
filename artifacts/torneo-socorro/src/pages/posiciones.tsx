import { useState } from 'react';
import { useGetPosiciones, useGetFases } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Valor especial para la pestaña "Tabla general": no manda `fase` al
 * endpoint, así el backend junta Primera vuelta + Segunda vuelta + partidos
 * sin fase asignada. Cualquier otro valor es el nombre exacto de una fase
 * (Liguilla, Cuartos...) tal como quedó escrito en los partidos.
 */
const TABLA_GENERAL = '__general__';

export default function Posiciones() {
  const [fase, setFase] = useState<string>(TABLA_GENERAL);
  const esTablaGeneral = fase === TABLA_GENERAL;
  const { data: fases } = useGetFases();
  const { data: posiciones, isLoading } = useGetPosiciones(esTablaGeneral ? undefined : { fase });
  const hayBonificacion = posiciones?.some((p) => (p.puntosBonificacion ?? 0) > 0);
  const colSpan = hayBonificacion ? 12 : 11;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Tabla de Posiciones</h1>
        <p className="text-muted-foreground mt-1">Clasificación general del torneo</p>
      </div>

      {fases && fases.length > 0 && (
        <Tabs value={fase} onValueChange={setFase}>
          <TabsList>
            <TabsTrigger value={TABLA_GENERAL}>Tabla general</TabsTrigger>
            {fases.map((f) => (
              <TabsTrigger key={f} value={f}>{f}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-sidebar text-sidebar-foreground hover:bg-sidebar">
                <TableHead className="w-12 text-center text-sidebar-foreground">POS</TableHead>
                <TableHead className="text-sidebar-foreground">EQUIPO</TableHead>
                <TableHead className="text-center font-mono text-sidebar-foreground" title="Partidos Jugados">PJ</TableHead>
                <TableHead className="text-center font-mono text-sidebar-foreground" title="Partidos Ganados">PG</TableHead>
                <TableHead className="text-center font-mono text-sidebar-foreground" title="Partidos Empatados">PE</TableHead>
                <TableHead className="text-center font-mono text-sidebar-foreground" title="Partidos Perdidos">PP</TableHead>
                <TableHead className="text-center font-mono text-sidebar-foreground" title="Goles a Favor">GF</TableHead>
                <TableHead className="text-center font-mono text-sidebar-foreground" title="Goles en Contra">GC</TableHead>
                <TableHead className="text-center font-mono text-sidebar-foreground" title="Diferencia de Goles">DF</TableHead>
                <TableHead
                  className="text-center font-mono text-sidebar-foreground"
                  title="Fair Play: amarilla = 10, roja = 20. Menos es mejor."
                >
                  FAIR PLAY
                </TableHead>
                {hayBonificacion && (
                  <TableHead
                    className="text-center font-mono text-sidebar-foreground"
                    title="Puntos de bonificación (liguilla) — criterio de desempate"
                  >
                    BONUS
                  </TableHead>
                )}
                <TableHead className="text-right font-mono text-secondary font-black text-lg" title="Puntos">PTS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="text-center py-10">Cargando posiciones...</TableCell>
                </TableRow>
              ) : posiciones?.map((pos) => (
                <TableRow
                  key={pos.equipoId}
                  className={esTablaGeneral && pos.posicion <= 4 ? "bg-accent/60 border-l-2 border-l-primary" : ""}
                >
                  <TableCell className="text-center font-mono font-bold text-lg">{pos.posicion}</TableCell>
                  <TableCell className="font-bold text-base whitespace-nowrap">{pos.equipoNombre}</TableCell>
                  <TableCell className="text-center font-mono">{pos.pj}</TableCell>
                  <TableCell className="text-center font-mono">{pos.pg}</TableCell>
                  <TableCell className="text-center font-mono">{pos.pe}</TableCell>
                  <TableCell className="text-center font-mono">{pos.pp}</TableCell>
                  <TableCell className="text-center font-mono">{pos.gf}</TableCell>
                  <TableCell className="text-center font-mono">{pos.gc}</TableCell>
                  <TableCell className="text-center font-mono">{pos.df > 0 ? `+${pos.df}` : pos.df}</TableCell>
                  <TableCell className="text-center font-mono text-muted-foreground">
                    {pos.puntajeFairplay ?? 0}
                  </TableCell>
                  {hayBonificacion && (
                    <TableCell className="text-center font-mono text-muted-foreground">
                      {pos.puntosBonificacion ? pos.puntosBonificacion.toFixed(2) : '-'}
                    </TableCell>
                  )}
                  <TableCell className="text-right font-mono font-black text-primary text-xl">{pos.pts}</TableCell>
                </TableRow>
              ))}
              {!isLoading && posiciones?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colSpan} className="text-center py-10 text-muted-foreground">No hay equipos registrados</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground space-y-2">
        {esTablaGeneral && (
          <p className="flex items-center gap-2">
            <span className="inline-block w-6 h-3 rounded-sm bg-accent border-l-2 border-l-primary" aria-hidden />
            Los 4 primeros clasifican a la liguilla.
          </p>
        )}
        <p>
          <span className="font-semibold text-foreground">Orden de desempate:</span> puntos, puntos de
          bonificación, diferencia de goles, juego limpio (menos es mejor), goles a favor y goles en contra.
        </p>
        <p>
          <span className="font-semibold text-foreground">Juego limpio:</span> cada amarilla suma 10 puntos y
          cada roja 20. El equipo con menos puntaje queda mejor ubicado en caso de empate.
        </p>
      </div>
    </div>
  );
}
