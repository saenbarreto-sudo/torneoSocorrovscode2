import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useGetPagosResumenEquipos, getGetPagosQueryOptions, useGetEquipos, type Equipo, type Pago } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/utils';
import { CONCEPTOS, CONCEPTO_LABEL, type Concepto } from '@/lib/conceptos-pago';
import { FileText, ArrowLeft, Printer } from 'lucide-react';
import { Link } from 'wouter';
import { useAuth, canAccessRoute } from '@/lib/auth';
import { ExtractoEquipo } from '@/components/extracto-equipo';
import { ImprimirPortal } from '@/components/imprimir-portal';

/**
 * `embebido`: se muestra como pestaña dentro de Tesorería (ver
 * pages/tesoreria.tsx), así que el título y el botón de volver los maneja
 * la página madre.
 */
export default function PagosResumen({ embebido = false }: { embebido?: boolean }) {
  const { role } = useAuth();
  const [concepto, setConcepto] = useState<Concepto>('Inscripcion');
  const esInscripcion = concepto === 'Inscripcion';

  const { data: resumen, isLoading } = useGetPagosResumenEquipos({ concepto });
  const { data: equipos } = useGetEquipos();
  // Aparte del selector de arriba (que solo trae UN concepto a la vez): el
  // saldo de inscripción que se muestra dentro del extracto imprimible
  // necesita el de "Inscripcion" siempre, sin importar cuál esté elegido.
  const { data: resumenInscripcionTodos } = useGetPagosResumenEquipos({ concepto: 'Inscripcion' });

  // El backend devuelve la proporción pagada como fracción (0 a 1);
  // aquí se convierte a porcentaje para mostrarla y para el ancho de la barra.
  // Solo tiene sentido para Inscripción: es el único concepto con un monto
  // adeudado configurado por equipo (equipos.deudaInscripcion). Para los
  // demás no hay una meta contra la cual medir "saldo" o "% pagado", así
  // que se ordena por lo pagado en su lugar.
  const filas = (resumen ?? [])
    .map((eq) => ({ ...eq, porcentaje: Math.round((eq.porcentajePagado ?? 0) * 100) }))
    .sort((a, b) => (esInscripcion ? b.porcentaje - a.porcentaje : b.pagado - a.pagado));

  const totales = filas.reduce(
    (acc, eq) => ({
      deuda: acc.deuda + eq.deudaTotal,
      pagado: acc.pagado + eq.pagado,
      saldo: acc.saldo + eq.saldo,
    }),
    { deuda: 0, pagado: 0, saldo: 0 },
  );

  const equiposAlDia = filas.filter((eq) => eq.saldo <= 0).length;

  // ── Extracto imprimible por equipo ──────────────────────────────────────
  const [equipoExtracto, setEquipoExtracto] = useState<Equipo | null>(null);
  const [conceptosExtracto, setConceptosExtracto] = useState<Set<Concepto>>(new Set(CONCEPTOS));

  // useGetPagos({ query: { enabled } }) no compila: el tipo generado exige
  // "queryKey" en ese objeto aunque en tiempo de ejecución sí es opcional
  // (lo completa por dentro). Se arma la misma llamada a mano con
  // useQuery + el "queryOptions" ya armado, para poder agregarle "enabled"
  // sin pelear con ese tipo.
  const { data: pagosDelEquipo } = useQuery<Pago[]>({
    ...getGetPagosQueryOptions(equipoExtracto ? { equipoId: equipoExtracto.id } : undefined),
    enabled: equipoExtracto != null,
  });

  const abrirExtracto = (equipo: Equipo) => {
    setConceptosExtracto(new Set(CONCEPTOS));
    setEquipoExtracto(equipo);
  };

  const alternarConceptoExtracto = (c: Concepto) => {
    setConceptosExtracto((previo) => {
      const copia = new Set(previo);
      if (copia.has(c)) copia.delete(c);
      else copia.add(c);
      return copia;
    });
  };

  const conceptosOrdenados = useMemo(() => CONCEPTOS.filter((c) => conceptosExtracto.has(c)), [conceptosExtracto]);
  const pagosFiltrados = useMemo(
    () => (pagosDelEquipo ?? []).filter((p) => conceptosExtracto.has(p.concepto as Concepto)),
    [pagosDelEquipo, conceptosExtracto],
  );
  const saldoInscripcionExtracto = useMemo(() => {
    if (!equipoExtracto || !conceptosExtracto.has('Inscripcion')) return undefined;
    const fila = resumenInscripcionTodos?.find((r) => r.equipoId === equipoExtracto.id);
    if (!fila) return undefined;
    return { deudaTotal: fila.deudaTotal, pagado: fila.pagado, saldo: fila.saldo };
  }, [equipoExtracto, conceptosExtracto, resumenInscripcionTodos]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        {!embebido && (
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
              <p className="text-muted-foreground mt-1">
                {esInscripcion ? 'Pagos de inscripción por equipo' : `Pagos de "${CONCEPTO_LABEL[concepto]}" por equipo`}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 w-full md:w-auto">
          <Select value={concepto} onValueChange={(v) => setConcepto(v as Concepto)}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONCEPTOS.map((c) => (
                <SelectItem key={c} value={c}>{CONCEPTO_LABEL[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {esInscripcion && filas.length > 0 && (
            <div className="rounded-lg border bg-card px-4 py-2 shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">A paz y salvo</p>
              <p className="font-mono font-bold text-primary text-lg">
                {equiposAlDia} <span className="text-muted-foreground text-sm font-normal">de {filas.length}</span>
              </p>
            </div>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-sidebar text-sidebar-foreground hover:bg-sidebar">
                <TableHead className="text-sidebar-foreground">Equipo</TableHead>
                {esInscripcion ? (
                  <>
                    <TableHead className="text-right text-sidebar-foreground">Inscripción</TableHead>
                    <TableHead className="text-right text-sidebar-foreground">Pagado</TableHead>
                    <TableHead className="text-right text-sidebar-foreground font-bold">Saldo</TableHead>
                    <TableHead className="text-center text-sidebar-foreground w-52">Progreso</TableHead>
                  </>
                ) : (
                  <TableHead className="text-right text-sidebar-foreground font-bold">
                    Pagado por {CONCEPTO_LABEL[concepto]}
                  </TableHead>
                )}
                <TableHead className="text-sidebar-foreground w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={esInscripcion ? 6 : 3} className="text-center py-10">Cargando...</TableCell></TableRow>
              ) : filas.map((eq) => {
                const alDia = eq.saldo <= 0;
                return (
                  <TableRow key={eq.equipoId}>
                    <TableCell className="font-bold text-base whitespace-nowrap">{eq.equipoNombre}</TableCell>
                    {esInscripcion ? (
                      <>
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
                      </>
                    ) : (
                      <TableCell className="text-right font-mono font-bold text-lg">
                        {formatMoney(eq.pagado)}
                      </TableCell>
                    )}
                    <TableCell>
                      {(() => {
                        const equipoCompleto = equipos?.find((e) => e.id === eq.equipoId);
                        return (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Extracto imprimible"
                            disabled={!equipoCompleto}
                            onClick={() => equipoCompleto && abrirExtracto(equipoCompleto)}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!isLoading && filas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={esInscripcion ? 6 : 3} className="text-center py-10 text-muted-foreground">
                    Registra equipos para llevar su estado de cuenta.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {filas.length > 0 && (
              <tfoot>
                <TableRow className="bg-muted/40 font-bold">
                  <TableCell>Total</TableCell>
                  {esInscripcion ? (
                    <>
                      <TableCell className="text-right font-mono">{formatMoney(totales.deuda)}</TableCell>
                      <TableCell className="text-right font-mono">{formatMoney(totales.pagado)}</TableCell>
                      <TableCell className="text-right font-mono">{formatMoney(totales.saldo)}</TableCell>
                      <TableCell />
                    </>
                  ) : (
                    <TableCell className="text-right font-mono">{formatMoney(totales.pagado)}</TableCell>
                  )}
                  <TableCell />
                </TableRow>
              </tfoot>
            )}
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {esInscripcion
          ? 'El valor de inscripción de cada equipo se configura en la pestaña Equipos.'
          : `"${CONCEPTO_LABEL[concepto]}" no tiene un monto fijo por equipo, así que aquí solo se muestra lo pagado, no un saldo pendiente.`}
      </p>

      {/* ── Extracto imprimible por equipo ── */}
      <Dialog open={equipoExtracto != null} onOpenChange={(v) => !v && setEquipoExtracto(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Extracto de {equipoExtracto?.nombre}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap gap-x-5 gap-y-2 border-b pb-4">
            {CONCEPTOS.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={conceptosExtracto.has(c)} onCheckedChange={() => alternarConceptoExtracto(c)} />
                {CONCEPTO_LABEL[c]}
              </label>
            ))}
          </div>

          {equipoExtracto && (
            <ExtractoEquipo
              equipo={equipoExtracto}
              pagos={pagosFiltrados}
              conceptos={conceptosOrdenados}
              saldoInscripcion={saldoInscripcionExtracto}
            />
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEquipoExtracto(null)}>Cerrar</Button>
            <Button onClick={() => window.print()} disabled={conceptosOrdenados.length === 0}>
              <Printer className="h-4 w-4 mr-2" /> Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImprimirPortal activo={equipoExtracto != null}>
        {equipoExtracto && (
          <ExtractoEquipo
            equipo={equipoExtracto}
            pagos={pagosFiltrados}
            conceptos={conceptosOrdenados}
            saldoInscripcion={saldoInscripcionExtracto}
          />
        )}
      </ImprimirPortal>
    </div>
  );
}
