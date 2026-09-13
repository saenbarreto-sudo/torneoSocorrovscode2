import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useGetMiEquipo, getGetPagosQueryOptions, type Pago } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Landmark, Printer, TrendingUp, Download } from 'lucide-react';
import { formatMoney, formatFecha } from '@/lib/utils';
import { CONCEPTOS, CONCEPTO_LABEL, esIngresoDeMesa, type Concepto } from '@/lib/conceptos-pago';
import { ExtractoEquipo } from '@/components/extracto-equipo';
import { ReciboPago } from '@/components/recibo-pago';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
  // El recibo que el delegado abrió para guardarse. Es el mismo comprobante
  // que entrega el Comité (components/recibo-pago.tsx), así que el papel que
  // se queda el equipo es idéntico al del torneo.
  const [reciboAbierto, setReciboAbierto] = useState<Pago | null>(null);

  const { data: pagos } = useQuery<Pago[]>({
    ...getGetPagosQueryOptions(equipoId != null ? { equipoId } : undefined),
    enabled: equipoId != null,
  });

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Cargando...</div>;
  if (!mio) return <div className="py-12 text-center text-muted-foreground">No pudimos cargar tu cuenta.</div>;

  const { equipo, cuenta } = mio;
  // "Tus recibos" son los comprobantes numerados que entrega el Comité. Lo
  // que el equipo paga en la mesa el día del partido (arbitraje, cinta de
  // capitán) no genera comprobante, así que no va en esta lista — tampoco
  // hay nada que descargar. Ver esIngresoDeMesa en lib/conceptos-pago.ts.
  const recibos = (pagos ?? []).filter((p) => !esIngresoDeMesa(p));
  const alDia = cuenta.saldoInscripcion <= 0;

  // Los comprobantes (recibo suelto y extracto) piden un Equipo completo,
  // pero /mi-equipo solo manda lo que el delegado necesita ver. Se completa
  // acá con lo que ya se sabe: el resto no sale impreso.
  const equipoParaRecibo = {
    id: equipo.id,
    nombre: equipo.nombre,
    delegado: equipo.delegado ?? null,
    telefono: equipo.telefono ?? null,
    color: equipo.color ?? null,
    activo: true,
    puntosBonificacion: 0,
    deudaInscripcion: cuenta.deudaInscripcion,
    createdAt: new Date().toISOString(),
  };
  // El saldo solo se imprime en los recibos de inscripción (ver recibo-pago.tsx).
  const saldoDelRecibo =
    reciboAbierto?.concepto === 'Inscripcion'
      ? { deudaTotal: cuenta.deudaInscripcion, pagado: cuenta.pagadoInscripcion, saldo: cuenta.saldoInscripcion }
      : undefined;

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
        <Cifra
          etiqueta="Total pendiente"
          valor={cuenta.pendienteTotal > 0 ? formatMoney(cuenta.pendienteTotal) : 'Al día'}
          alerta={cuenta.pendienteTotal > 0}
          detalle={`Pagado en total: ${formatMoney(cuenta.pagadoTotal)}`}
        />
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

      {/* ── El detalle concepto por concepto ── */}
      <Card>
        <CardContent className="p-0">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-bold">Qué debes y qué has pagado</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Concepto por concepto</p>
          </div>
          <div className="overflow-x-auto">
            <Table variant="torneo">
              <TableHeader>
                <TableRow>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Pendiente</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cuenta.conceptos.map((c) => (
                  <TableRow key={c.concepto} className={c.pendiente ? 'bg-destructive/5' : ''}>
                    <TableCell className="font-semibold">
                      {c.etiqueta}
                      {c.cantidadPendiente != null && c.cantidadPendiente > 0 && (
                        <span className="text-muted-foreground font-normal"> · {c.cantidadPendiente} sin pagar</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {c.pendiente == null ? (
                        // No se lleva como deuda: solo se registra lo que se
                        // paga, así que no hay un "falta" que mostrar.
                        <span className="text-muted-foreground" title="Este concepto no se lleva como deuda: solo se registra lo que se paga">—</span>
                      ) : c.pendiente > 0 ? (
                        <span className="font-bold text-destructive">{formatMoney(c.pendiente)}</span>
                      ) : (
                        <span className="text-muted-foreground">Al día</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {c.pagado > 0 ? formatMoney(c.pagado) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 bg-muted/40">
                  <TableCell className="font-bold">Total</TableCell>
                  <TableCell className="text-right font-mono tabular-nums font-bold">
                    {cuenta.pendienteTotal > 0 ? (
                      <span className="text-destructive">{formatMoney(cuenta.pendienteTotal)}</span>
                    ) : (
                      'Al día'
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums font-bold">
                    {formatMoney(cuenta.pagadoTotal)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground px-6 py-3 border-t">
            Los conceptos con «—» en Pendiente no se llevan como deuda: se registran cuando se pagan.
          </p>
        </CardContent>
      </Card>

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
            <Table variant="torneo">
              <TableHeader>
                <TableRow>
                  <TableHead>N.º</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Periodo</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recibos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
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
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setReciboAbierto(p)}
                            title="Ver y guardar este recibo"
                            aria-label={`Descargar el recibo ${p.codigoRecibo ?? p.id}`}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 bg-muted/40">
                      <TableCell colSpan={4} className="font-bold">Total pagado</TableCell>
                      <TableCell className="text-right font-mono tabular-nums font-bold">
                        {formatMoney(recibos.reduce((s, p) => s + p.monto, 0))}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Un recibo suelto, para verlo y guardarlo ── */}
      <Dialog open={reciboAbierto != null} onOpenChange={(v) => !v && setReciboAbierto(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Recibo de pago</DialogTitle>
          </DialogHeader>
          {reciboAbierto && (
            <ReciboPago pago={reciboAbierto} equipo={equipoParaRecibo} saldoInscripcion={saldoDelRecibo} />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReciboAbierto(null)}>Cerrar</Button>
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" /> Guardar / imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* La copia que de verdad se imprime va fuera del diálogo; ver el
          comentario junto a ".imprimir-solo" en index.css. */}
      <ImprimirPortal activo={reciboAbierto != null}>
        {reciboAbierto && (
          <ReciboPago pago={reciboAbierto} equipo={equipoParaRecibo} saldoInscripcion={saldoDelRecibo} />
        )}
      </ImprimirPortal>

      <ImprimirPortal activo={imprimiendo}>
        <ExtractoEquipo
          equipo={equipoParaRecibo}
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
