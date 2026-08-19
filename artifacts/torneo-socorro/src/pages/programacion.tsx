import { useGetProgramacion } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CalendarDays } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function Programacion() {
  const { data: programacion, isLoading } = useGetProgramacion();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 text-primary rounded-lg">
          <CalendarDays className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Cronograma del Torneo</h1>
          <p className="text-muted-foreground mt-1">Fechas y semanas programadas</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24 text-center">Semana N°</TableHead>
                <TableHead>Nombre / Descripción</TableHead>
                <TableHead>Fecha Inicio</TableHead>
                <TableHead>Fecha Fin</TableHead>
                <TableHead className="text-center">Festivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10">Cargando cronograma...</TableCell>
                </TableRow>
              ) : programacion?.map((prog) => (
                <TableRow key={prog.id}>
                  <TableCell className="text-center font-mono font-bold text-lg">{prog.semana}</TableCell>
                  <TableCell className="font-bold">{prog.nombreSemana || `Fecha ${prog.semana}`}</TableCell>
                  <TableCell className="font-mono">{prog.fechaDesde || '-'}</TableCell>
                  <TableCell className="font-mono">{prog.fechaHasta || '-'}</TableCell>
                  <TableCell className="text-center">
                    {prog.esFestivo ? (
                      <Badge variant="warning">Sí</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && programacion?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">No hay programación definida</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
