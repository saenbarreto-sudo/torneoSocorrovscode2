import { useState } from 'react';
import { useGetPagos, useCreatePago, useDeletePago, getGetPagosQueryKey, type Pago } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Loader2, Receipt } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { extractErrorMessage } from '@/lib/api-errors';
import { formatMoney } from '@/lib/utils';
import { CONCEPTOS, CONCEPTO_LABEL } from '@/lib/conceptos-pago';

export interface PartidoDeMesa {
  id: number;
  semana: number;
  fecha?: string | null;
  localId: number;
  localNombre: string;
  visitanteId: number;
  visitanteNombre: string;
}

/**
 * El "dato financiero" de la planilla: lo que los dos equipos abonan en la
 * mesa el día del partido.
 *
 * No es un campo suelto para anotar una cifra — cada abono queda como un
 * recibo de verdad (con su consecutivo INS001, M002...), igual que si se
 * armara desde "Nuevo Recibo", y por eso hay que elegirle el concepto. Así
 * lo que se recibe en la cancha entra derecho a la cuenta del equipo en vez
 * de quedar escrito en un papel que después toca volver a digitar.
 *
 * Se registra de una (no al guardar la planilla) justamente porque es plata:
 * el recibo se numera en el momento y se puede borrar si quedó mal.
 */
export function AbonosMesa({ partido, readOnly }: { partido: PartidoDeMesa; readOnly: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: pagos, isLoading } = useGetPagos();
  const crear = useCreatePago();
  const borrar = useDeletePago();

  const [equipoId, setEquipoId] = useState<string>(String(partido.localId));
  const [concepto, setConcepto] = useState<string>('Inscripcion');
  const [monto, setMonto] = useState('');

  // Los abonos de esta fecha del torneo para los dos equipos del partido.
  // Se cruza por semana y no por fecha del calendario porque un recibo viejo
  // puede haber quedado sin fecha, y la semana sí la lleva siempre.
  const abonos = (pagos ?? []).filter(
    (p: Pago) =>
      p.semana === partido.semana && (p.equipoId === partido.localId || p.equipoId === partido.visitanteId),
  );
  const total = abonos.reduce((s, p) => s + p.monto, 0);

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: getGetPagosQueryKey() });
    queryClient.invalidateQueries({ queryKey: ['/api/pagos'] });
    queryClient.invalidateQueries({ queryKey: ['/api/mi-equipo'] });
  };

  const registrar = () => {
    const valor = Number(monto);
    if (!valor || valor <= 0) {
      toast({
        title: 'Falta el monto',
        description: 'Escribe cuánto abonó el equipo para poder generar el recibo.',
        variant: 'destructive',
      });
      return;
    }
    crear.mutate(
      {
        data: {
          equipoId: Number(equipoId),
          concepto,
          monto: valor,
          semana: partido.semana,
          ...(partido.fecha ? { fecha: partido.fecha } : {}),
        },
      },
      {
        onSuccess: (pago) => {
          refrescar();
          setMonto('');
          toast({
            title: `Recibo ${pago.codigoRecibo ?? ''} generado`,
            description: `${CONCEPTO_LABEL[concepto] ?? concepto} · ${formatMoney(valor)} de ${pago.equipoNombre}.`,
          });
        },
        onError: (err) =>
          toast({ title: 'No se pudo registrar el abono', description: extractErrorMessage(err), variant: 'destructive' }),
      },
    );
  };

  const eliminar = (pago: Pago) => {
    borrar.mutate(
      { id: pago.id },
      {
        onSuccess: () => {
          refrescar();
          toast({ title: `Recibo ${pago.codigoRecibo ?? pago.id} eliminado` });
        },
        onError: (err) =>
          toast({ title: 'No se pudo eliminar', description: extractErrorMessage(err), variant: 'destructive' }),
      },
    );
  };

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="bg-secondary text-secondary-foreground px-3 py-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-bold text-sm">
          <Receipt className="h-4 w-4" />
          Dato financiero · abonos recibidos en la mesa
        </span>
        {total > 0 && <span className="font-mono font-bold text-sm shrink-0">{formatMoney(total)}</span>}
      </div>

      <div className="p-3 space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-2">Cargando recibos...</p>
        ) : abonos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay abonos registrados en esta fecha para estos dos equipos.
          </p>
        ) : (
          <div className="divide-y rounded border">
            {abonos.map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <span className="font-mono text-xs bg-muted rounded px-1.5 py-0.5 shrink-0">
                  {p.codigoRecibo ?? `#${p.id}`}
                </span>
                <span className="font-medium truncate">{p.equipoNombre}</span>
                <span className="text-muted-foreground text-xs truncate">
                  {CONCEPTO_LABEL[p.concepto] ?? p.concepto}
                </span>
                <span className="ml-auto font-mono font-bold shrink-0">{formatMoney(p.monto)}</span>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => eliminar(p)}
                    aria-label={`Eliminar recibo ${p.codigoRecibo ?? p.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {!readOnly && (
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
            <div className="space-y-1">
              <Label htmlFor="abono-equipo" className="text-xs">Equipo</Label>
              <Select value={equipoId} onValueChange={setEquipoId}>
                <SelectTrigger id="abono-equipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={String(partido.localId)}>{partido.localNombre}</SelectItem>
                  <SelectItem value={String(partido.visitanteId)}>{partido.visitanteNombre}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="abono-concepto" className="text-xs">Concepto</Label>
              <Select value={concepto} onValueChange={setConcepto}>
                <SelectTrigger id="abono-concepto"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONCEPTOS.map((c) => (
                    <SelectItem key={c} value={c}>{CONCEPTO_LABEL[c] ?? c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="abono-monto" className="text-xs">Monto</Label>
              <Input
                id="abono-monto"
                className="w-32 text-right font-mono"
                inputMode="numeric"
                placeholder="0"
                value={monto}
                onChange={(e) => setMonto(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <Button onClick={registrar} disabled={crear.isPending}>
              {crear.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Generar recibo
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Cada abono queda como un recibo con su propio consecutivo y entra de una a la cuenta del equipo,
          igual que si se hiciera desde Pagos.
        </p>
      </div>
    </div>
  );
}
