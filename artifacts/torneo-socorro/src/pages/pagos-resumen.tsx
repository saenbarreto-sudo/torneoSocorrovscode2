import { useGetPagosResumenEquipos } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney } from '@/lib/utils';
import { FileText, ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { useAuth, canAccessRoute } from '@/lib/auth';

export default function PagosResumen() {
  const { role } = useAuth();
  const { data: resumen, isLoading } = useGetPagosResumenEquipos();

  // El backend devuelve la proporción pagada como fracción (0 a 1);
  // aquí se convierte a porcentaje para mostrarla y para el ancho de la barra.
  const filas = (resumen ?? [])
    .map((eq) => ({ ...eq, porcentaje: Math.round((eq.porcentajePagado ?? 0) * 100) }))
    .sort((a, b) => b.porcentaje - a.porcentaje);

  const totales = filas.reduce(
    (acc, eq) => ({
      deuda: acc.deuda + eq.deudaTotal,
      pagado: acc.pagado + eq.pagado,
      saldo: acc.saldo + eq.saldo,
    }),
    { deuda: 0, pagado: 0, saldo: 0 },
  );

  const equiposAlDia = filas.filter((eq) => eq.saldo <= 0).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          {canAccessRoute(role, '/pagos') && (
            <Button variant="outline" size="icon" asChild>
              <Link href="/pagos" aria-label="Volver a Pagos"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
          )}
          <div className="p-3 bg-primary/10 text-primary rounded-lg">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Estado de cuenta</h1>
            <p className="text-muted-foreground mt-1">Pagos de inscripción por equipo</p>
          </div>
        </div>

        {filas.length > 0 && (
          <div className="rounded-lg border bg-card px-4 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Equipos a paz y salvo</p>
            <p className="font-mono font-bold text-primary text-lg">
              {equiposAlDia} <span className="text-muted-foreground text-sm font-normal">de {filas.length}</span>
            </p>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-sidebar text-sidebar-foreground hover:bg-sidebar">
                <TableHead className="text-sidebar-foreground">Equipo</TableHead>
                <TableHead className="text-right text-sidebar-foreground">Inscripción</TableHead>
                <TableHead className="text-right text-sidebar-foreground">Pagado</TableHead>
                <TableHead className="text-right text-sidebar-foreground font-bold">Saldo</TableHead>
                <TableHead className="text-center text-sidebar-foreground w-52">Progreso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-10">Cargando...</TableCell></TableRow>
              ) : filas.map((eq) => {
                const alDia = eq.saldo <= 0;
                return (
                  <TableRow key={eq.equipoId}>
                    <TableCell className="font-bold text-base whitespace-nowrap">{eq.equipoNombre}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatMoney(eq.deudaTotal)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatMoney(eq.pagado)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono font-bold text-lg ${alDia ? 'text-muted-foreground' : 'text-destructive'}`}
                    >
                      {alDia ? 'Al día' : formatMoney(eq.saldo)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden"
                          role="progressbar"
                          aria-valuenow={eq.porcentaje}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Pagado por ${eq.equipoNombre}`}
                        >
                          <div
                            className={`h-full rounded-full transition-all ${alDia ? 'bg-primary' : 'bg-secondary'}`}
                            style={{ width: `${Math.min(Math.max(eq.porcentaje, 0), 100)}%` }}
                          />
                        </div>
                        <span className="font-mono text-sm font-bold min-w-[3rem] text-right">
                          {eq.porcentaje}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!isLoading && filas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    Registra equipos para llevar su estado de cuenta.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {filas.length > 0 && (
              <tfoot>
                <TableRow className="bg-muted/40 font-bold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(totales.deuda)}</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(totales.pagado)}</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(totales.saldo)}</TableCell>
                  <TableCell />
                </TableRow>
              </tfoot>
            )}
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        El valor de inscripción de cada equipo se configura en la pestaña Equipos.
      </p>
    </div>
  );
}
