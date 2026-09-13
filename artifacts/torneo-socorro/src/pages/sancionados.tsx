import { useGetAmonestados } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Ban, Printer } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { useAuth, esDelComite } from '@/lib/auth';
import { ImprimirPortal } from '@/components/imprimir-portal';
import { TablaImprimible } from '@/components/tabla-imprimible';
import { useImprimir } from '@/hooks/use-imprimir';
import { NombreEquipo } from '@/components/nombre-equipo';

/**
 * Quién está sancionado y cuánto debe por tarjetas: la cartelera que se
 * revisa antes de cada fecha, para saber a quién no se puede alinear y qué
 * hay que pagar en la mesa.
 *
 * El delegado y el invitado solo la consultan; el Comité y el Administrador
 * del sistema sí la pueden imprimir, que es la hoja que se pega en la
 * cartelera antes de cada fecha.
 *
 * `embebido`: va dentro de Tablas del torneo (ver pages/tablas-torneo.tsx).
 */
export default function Sancionados({ embebido = false }: { embebido?: boolean }) {
  const { data: amonestados, isLoading } = useGetAmonestados();
  const { role } = useAuth();
  const { imprimiendo, imprimir } = useImprimir();

  const filas = amonestados ?? [];
  const totalDeuda = filas.reduce((s, a) => s + (a.valorDeuda ?? 0), 0);
  const sancionados = filas.filter((a) => (a.sancionFechas ?? 0) > 0).length;

  return (
    <div className={embebido ? 'space-y-3' : 'space-y-6 animate-in fade-in duration-500'}>
      <div className="flex items-center gap-2">
        <Ban className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold tracking-tight">Sancionados y tarjetas</h2>
        {filas.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {sancionados > 0 && `${sancionados} con fechas pendientes · `}
            {formatMoney(totalDeuda)} por cobrar
          </span>
        )}
        {/* Solo quien organiza el torneo saca la hoja para la cartelera. */}
        {esDelComite(role) && filas.length > 0 && (
          <Button variant="ghost" size="icon" onClick={imprimir} aria-label="Imprimir sancionados">
            <Printer className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table variant="torneo">
            <TableHeader>
              <TableRow>
                <TableHead>Jugador</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead className="text-center">Amar.</TableHead>
                <TableHead className="text-center">Rojas</TableHead>
                <TableHead className="text-center">Sanción</TableHead>
                <TableHead className="text-right">Debe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6">Cargando...</TableCell>
                </TableRow>
              ) : filas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                    Todavía no hay tarjetas en el torneo.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {filas.map((a) => (
                    <TableRow key={a.jugadorId} className={(a.sancionFechas ?? 0) > 0 ? 'bg-destructive/5' : ''}>
                      <TableCell className="font-bold whitespace-nowrap">
                        {a.jugadorNombre}
                        {a.nCarnet != null && (
                          <span className="text-muted-foreground font-normal font-mono"> · #{String(a.nCarnet).padStart(4, '0')}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          <NombreEquipo nombre={a.equipoNombre} />
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-mono tabular-nums">{a.amarillas || '—'}</TableCell>
                      <TableCell className="text-center font-mono tabular-nums">{a.rojas || '—'}</TableCell>
                      <TableCell className="text-center whitespace-nowrap">
                        {(a.sancionFechas ?? 0) > 0 ? (
                          <Badge variant="destructive">
                            {a.sancionFechas === 1 ? '1 fecha' : `${a.sancionFechas} fechas`}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {(a.valorDeuda ?? 0) > 0 ? (
                          <span className="font-bold text-destructive">{formatMoney(a.valorDeuda ?? 0)}</span>
                        ) : (
                          <span className="text-muted-foreground">Al día</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 bg-muted/40">
                    <TableCell colSpan={5} className="font-bold">Total por cobrar</TableCell>
                    <TableCell className="text-right font-mono tabular-nums font-bold">
                      {formatMoney(totalDeuda)}
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Las amarillas que se muestran son las que están sin pagar. Un jugador con fechas pendientes no se puede alinear
        hasta cumplirlas.
      </p>

      <ImprimirPortal activo={imprimiendo}>
        <TablaImprimible
          titulo="SANCIONADOS Y TARJETAS"
          columnas={[
            { encabezado: 'Jugador' },
            { encabezado: 'Equipo' },
            { encabezado: 'Amar.', alineacion: 'centro' },
            { encabezado: 'Rojas', alineacion: 'centro' },
            { encabezado: 'Sanción', alineacion: 'centro' },
            { encabezado: 'Debe', alineacion: 'derecha' },
          ]}
          filas={[
            ...filas.map((a) => ({
              clave: a.jugadorId,
              destacada: (a.sancionFechas ?? 0) > 0,
              celdas: [
                a.jugadorNombre,
                a.equipoNombre,
                a.amarillas || '—',
                a.rojas || '—',
                (a.sancionFechas ?? 0) > 0 ? `${a.sancionFechas} fecha(s)` : '—',
                (a.valorDeuda ?? 0) > 0 ? formatMoney(a.valorDeuda ?? 0) : 'Al día',
              ],
            })),
            {
              clave: 'total',
              destacada: true,
              celdas: ['Total por cobrar', '', '', '', '', formatMoney(totalDeuda)],
            },
          ]}
          nota="Las amarillas que se muestran son las que están sin pagar. Un jugador con fechas pendientes no se puede alinear hasta cumplirlas."
        />
      </ImprimirPortal>
    </div>
  );
}
