import { useGetVallas } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Shield, Medal, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ImprimirPortal } from '@/components/imprimir-portal';
import { TablaImprimible } from '@/components/tabla-imprimible';
import { useImprimir } from '@/hooks/use-imprimir';

const NOTA_WO = 'Los goles de partidos ganados por W.O. no se cuentan aquí, según el Art. 23 del reglamento. La valla deja de sumar al terminar la fase de grupos.';

/** `embebido`: va dentro de Tablas del torneo (ver pages/tablas-torneo.tsx), donde el título va compacto. */
export default function Vallas({ embebido = false }: { embebido?: boolean }) {
  const { data: vallas, isLoading } = useGetVallas();
  const conPartidos = (vallas ?? []).filter((v) => v.partidosJugados > 0);
  const { imprimiendo, imprimir } = useImprimir();

  const botonImprimir = (
    <Button variant="ghost" size="icon" onClick={imprimir} aria-label="Imprimir valla menos vencida">
      <Printer className="h-4 w-4" />
    </Button>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {embebido ? (
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold tracking-tight">Valla menos vencida</h2>
          <span className="ml-auto">{botonImprimir}</span>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 text-primary rounded-lg">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Valla menos vencida</h1>
            <p className="text-muted-foreground mt-1">Equipos con menos goles recibidos</p>
          </div>
          <span className="ml-auto">{botonImprimir}</span>
        </div>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-sidebar text-sidebar-foreground hover:bg-sidebar">
                <TableHead className="w-16 text-center text-sidebar-foreground">Pos</TableHead>
                <TableHead className="text-sidebar-foreground">Equipo</TableHead>
                <TableHead className="text-center text-sidebar-foreground font-mono">PJ</TableHead>
                <TableHead className="text-center text-sidebar-foreground font-mono">Promedio</TableHead>
                <TableHead className="text-right text-sidebar-foreground font-mono">Goles recibidos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-10">Cargando...</TableCell></TableRow>
              ) : conPartidos.map((v, idx) => (
                <TableRow key={v.equipoId} className={idx < 3 ? 'bg-accent/50' : ''}>
                  <TableCell className="text-center font-mono font-bold text-lg">
                    {idx === 0 ? <Medal className="h-6 w-6 mx-auto text-yellow-500" /> :
                     idx === 1 ? <Medal className="h-6 w-6 mx-auto text-gray-400" /> :
                     idx === 2 ? <Medal className="h-6 w-6 mx-auto text-amber-700" /> :
                     idx + 1}
                  </TableCell>
                  <TableCell className="font-bold text-base">{v.equipoNombre}</TableCell>
                  <TableCell className="text-center font-mono tabular-nums">{v.partidosJugados}</TableCell>
                  <TableCell className="text-center font-mono tabular-nums text-muted-foreground">
                    {(v.promedio ?? 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-black text-primary text-2xl tabular-nums">
                    {v.golesRecibidos}
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && conPartidos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    La tabla se llena a medida que se registren resultados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{NOTA_WO}</p>

      <ImprimirPortal activo={imprimiendo}>
        <TablaImprimible
          titulo="VALLA MENOS VENCIDA"
          columnas={[
            { encabezado: 'Pos', alineacion: 'centro' },
            { encabezado: 'Equipo' },
            { encabezado: 'PJ', alineacion: 'centro' },
            { encabezado: 'Promedio', alineacion: 'centro' },
            { encabezado: 'Goles recibidos', alineacion: 'derecha' },
          ]}
          filas={conPartidos.map((v, idx) => ({
            clave: v.equipoId,
            destacada: idx < 3,
            celdas: [idx + 1, v.equipoNombre, v.partidosJugados, (v.promedio ?? 0).toFixed(2), v.golesRecibidos],
          }))}
          nota={NOTA_WO}
        />
      </ImprimirPortal>
    </div>
  );
}
