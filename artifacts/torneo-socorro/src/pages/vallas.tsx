import { useGetVallas } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Shield, Medal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function Vallas() {
  const { data: vallas, isLoading } = useGetVallas();
  const conPartidos = (vallas ?? []).filter((v) => v.partidosJugados > 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 text-primary rounded-lg">
          <Shield className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Valla menos vencida</h1>
          <p className="text-muted-foreground mt-1">Equipos con menos goles recibidos</p>
        </div>
      </div>

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

      <p className="text-xs text-muted-foreground">
        Los goles de partidos ganados por W.O. no se cuentan aquí, según el Art. 23 del reglamento.
      </p>
    </div>
  );
}
