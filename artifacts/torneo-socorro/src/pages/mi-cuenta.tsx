import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useGetMiEquipo, getGetPagosQueryOptions, type Pago } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Landmark, Printer, TrendingUp, AlertTriangle } from 'lucide-react';
import { formatMoney, formatFecha } from '@/lib/utils';
import { CONCEPTOS, CONCEPTO_LABEL, type Concepto } from '@/lib/conceptos-pago';
import { ExtractoEquipo } from '@/components/extracto-equipo';
import { ImprimirPortal } from '@/components/imprimir-portal';
import { useImprimir } from '@/hooks/use-imprimir';

/** Una cifra de la cuenta, con su etiqueta. */
function Cifra({
  etiqueta,
  valor,
  detalle,
  alerta,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  alerta?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{etiqueta}</p>
        <p className={`font-mono font-bold text-lg ${alerta ? 'text-destructive' : ''}`}>{valor}</p>
        {detalle && <p className="text-xs text-muted-foreground mt-0.5">{detalle}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * La cuenta del equipo del delegado con el torneo: cuánto debe, cuánto ha
 * pagado y sus recibos. El servidor solo le entrega los de su equipo (ver
 * lib/alcance.ts), así que acá no hay nada que filtrar por seguridad.
 */
export default function MiCuenta() {
  const { data: mio, isLoading } = useGetMiEquipo();
  const equipoId = mio?.equipo.id;
  const { imprimiendo, imprimir } = useImprimir();
  const [conceptosExtracto] = useState<Concepto[]>([...CONCEPTOS]);

  const { data: pagos } = useQuery<Pago[]>({
    ...getGetPagosQueryOptions(equipoId != null ? { equipoId } : undefined),
    enabled: equipoId != null,
  });

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Cargando...</div>;
  if (!mio) return <div className="py-12 text-center text-muted-foreground">No pudimos cargar tu cuenta.</div>;

  const { equipo, cuenta } = mio;
  const recibos = pagos ?? [];
  const alDia = cuenta.saldoInscripcion <= 0;

  // Lo pendiente que no es inscripción: tarjetas y carnés sin pagar.
  const otrosPendientes = cuenta.valorAmarillasSinPagar + cuenta.valorCarnetsSinPagar;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 text-primary rounded-lg">
            <Landmark className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Mi cuenta</h1>
            <p className="text-muted-foreground mt-1">Lo que {equipo.nombre} ha pagado y lo que falta</p>
          </div>
        </div>
        {recibos.length > 0 && (
          <Button variant="outline" onClick={imprimir} className="shrink-0">
            <Printer className="h-4 w-4 mr-2" /> Imprimir extracto
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Cifra etiqueta="Inscripción" valor={formatMoney(cuenta.deudaInscripcion)} detalle="Valor del torneo" />
        <Cifra etiqueta="Pagado de inscripción" valor={formatMoney(cuenta.pagadoInscripcion)} />
        <Cifra
          etiqueta="Saldo de inscripción"
          valor={alDia ? 'Al día' : formatMoney(cuenta.saldoInscripcion)}
          alerta={!alDia}
          detalle={alDia ? 'No debes nada de inscripción' : undefined}
        />
        <Cifra etiqueta="Pagado en total" valor={formatMoney(cuenta.pagadoTotal)} detalle="Todos los conceptos" />
      </div>

      {/* ── Barra de avance de la inscripción ── */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Avance de la inscripción
            </span>
            <span className="font-mono">
              {cuenta.deudaInscripcion > 0
                ? `${Math.min(100, Math.round((cuenta.pagadoInscripcion / cuenta.deudaInscripcion) * 100))}%`
                : '—'}
            </span>
          </div>
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full ${alDia ? 'bg-emerald-500' : 'bg-primary'}`}
              style={{
                width:
                  cuenta.deudaInscripcion > 0
                    ? `${Math.min(100, (cuenta.pagadoInscripcion / cuenta.deudaInscripcion) * 100)}%`
                    : '0%',
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Otros pendientes ── */}
      {otrosPendientes > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-bold text-sm">Además tienes pendiente {formatMoney(otrosPendientes)}</p>
              <p className="text-sm text-muted-foreground">
                {cuenta.amarillasSinPagar > 0 &&
                  `${cuenta.amarillasSinPagar} tarjeta(s) amarilla(s) por ${formatMoney(cuenta.valorAmarillasSinPagar)}`}
                {cuenta.amarillasSinPagar > 0 && cuenta.carnetsSinPagar > 0 && ' · '}
                {cuenta.carnetsSinPagar > 0 &&
                  `${cuenta.carnetsSinPagar} carné(s) por ${formatMoney(cuenta.valorCarnetsSinPagar)}`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Sus recibos ── */}
      <Card>
        <CardContent className="p-0">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-bold">Tus recibos</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {recibos.length === 0 ? 'Todavía no hay pagos registrados' : `${recibos.length} pago(s) registrados`}
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N.º</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Periodo</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recibos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                      Cuando el Comité registre un pago tuyo, aparecerá acá.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {recibos.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-muted-foreground">{p.codigoRecibo ?? '—'}</TableCell>
                        <TableCell className="font-mono whitespace-nowrap">{formatFecha(p.fecha)}</TableCell>
                        <TableCell className="font-semibold">{CONCEPTO_LABEL[p.concepto] ?? p.concepto}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.mes || (p.semana != null ? `Fecha ${p.semana}` : '—')}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{formatMoney(p.monto)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 bg-muted/40">
                      <TableCell colSpan={4} className="font-bold">Total pagado</TableCell>
                      <TableCell className="text-right font-mono tabular-nums font-bold">
                        {formatMoney(recibos.reduce((s, p) => s + p.monto, 0))}
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ImprimirPortal activo={imprimiendo}>
        <ExtractoEquipo
          equipo={{
            id: equipo.id,
            nombre: equipo.nombre,
            delegado: equipo.delegado ?? null,
            telefono: equipo.telefono ?? null,
            color: equipo.color ?? null,
            activo: true,
            puntosBonificacion: 0,
            deudaInscripcion: cuenta.deudaInscripcion,
            createdAt: new Date().toISOString(),
          }}
          pagos={recibos}
          conceptos={conceptosExtracto}
          saldoInscripcion={{
            deudaTotal: cuenta.deudaInscripcion,
            pagado: cuenta.pagadoInscripcion,
            saldo: cuenta.saldoInscripcion,
          }}
        />
      </ImprimirPortal>
    </div>
  );
}
