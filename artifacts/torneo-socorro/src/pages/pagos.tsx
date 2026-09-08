import { useMemo, useState } from 'react';
import {
  useGetPagos,
  useCreatePago,
  useDeletePago,
  getGetPagosQueryKey,
  useGetEquipos,
  useGetPagosResumenEquipos,
  getGetPagosResumenEquiposQueryKey,
  type Pago,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Receipt, FileText, Printer } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { useAuth, canWrite } from '@/lib/auth';
import { extractErrorMessage } from '@/lib/api-errors';
import { formatMoney } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';
import { ReciboPago } from '@/components/recibo-pago';
import { ReciboParaImprimir } from '@/components/recibo-para-imprimir';
import { CONCEPTOS } from '@/lib/conceptos-pago';

const pagoSchema = z.object({
  equipoId: z.coerce.number().min(1, 'Seleccione un equipo'),
  concepto: z.string().min(1, 'Seleccione un concepto'),
  monto: z.coerce.number().min(1, 'El monto debe ser mayor a 0'),
  // Unión con '' en vez de un simple ".optional()": así, si se deja vacío
  // no se convierte silenciosamente en 0, y si se escribe algo que no es un
  // número entero (letras, decimales) se rechaza con un mensaje, en vez de
  // guardarse como NaN sin que se note.
  semana: z.union([
    z.literal(''),
    z.coerce.number({ invalid_type_error: 'La semana debe ser un número entero' }).int('La semana debe ser un número entero').positive('La semana debe ser un número entero'),
  ]).optional(),
  mes: z.string().optional(),
  fecha: z.string().optional(),
});

type PagoFormValues = z.infer<typeof pagoSchema>;

export default function Pagos() {
  const { role, user } = useAuth();
  const readOnly = !canWrite(role, 'pagos');
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [filtroEquipo, setFiltroEquipo] = useState<string>('all');
  
  const { data: equipos } = useGetEquipos();
  const { data: pagos, isLoading } = useGetPagos(
    filtroEquipo !== 'all' ? { equipoId: Number(filtroEquipo) } : undefined
  );
  // Para el saldo de inscripción que se muestra en el recibo. Sin params
  // trae el resumen de "Inscripcion" (el default del backend).
  const { data: resumenInscripcion } = useGetPagosResumenEquipos();

  const createMutation = useCreatePago();
  const deleteMutation = useDeletePago();

  const [open, setOpen] = useState(false);
  const [pagoRecibo, setPagoRecibo] = useState<Pago | null>(null);

  const saldoDelRecibo = useMemo(() => {
    if (!pagoRecibo || pagoRecibo.concepto !== 'Inscripcion') return undefined;
    const fila = resumenInscripcion?.find((r) => r.equipoId === pagoRecibo.equipoId);
    if (!fila) return undefined;
    return { deudaTotal: fila.deudaTotal, pagado: fila.pagado, saldo: fila.saldo };
  }, [pagoRecibo, resumenInscripcion]);

  const form = useForm<PagoFormValues>({
    resolver: zodResolver(pagoSchema),
    defaultValues: {
      equipoId: 0,
      concepto: 'Inscripcion',
      monto: 0,
      fecha: new Date().toISOString().split('T')[0]
    }
  });

  const onSubmit = (values: PagoFormValues) => {
    // El input manda "" cuando queda vacío; la API no acepta eso, solo un
    // número o que el campo no venga.
    const data = { ...values, semana: values.semana === '' ? undefined : values.semana };
    createMutation.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPagosQueryKey() });
        // También invalidar el resumen por equipo (para todos los conceptos:
        // sin "exact", esto alcanza tanto la vista por defecto como
        // cualquier otro concepto que se haya consultado con un filtro).
        queryClient.invalidateQueries({ queryKey: getGetPagosResumenEquiposQueryKey() });
        toast({ title: 'Pago registrado exitosamente' });
        setOpen(false);
        form.reset();
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm('¿Está seguro de anular este recibo de pago?')) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPagosQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPagosResumenEquiposQueryKey() });
          toast({ title: 'Pago anulado' });
        },
        onError: (err) => {
          toast({ title: 'No se pudo anular', description: extractErrorMessage(err), variant: 'destructive' });
        },
      });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-green-100 text-green-700 rounded-lg">
            <Receipt className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Recibos de Caja</h1>
            <p className="text-muted-foreground mt-1">Registro de pagos e ingresos</p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <Select value={filtroEquipo} onValueChange={setFiltroEquipo}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Todos los equipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los equipos</SelectItem>
              {equipos?.map(eq => (
                <SelectItem key={eq.id} value={eq.id.toString()}>{eq.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button asChild variant="outline" className="mr-2 w-full sm:w-auto">
            <Link href="/pagos/resumen">
              <FileText className="h-4 w-4 mr-2" />
              Estado de Cuenta
            </Link>
          </Button>

          {!readOnly && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Recibo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registrar Pago</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="equipoId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Equipo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ? field.value.toString() : ""}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Seleccione equipo" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {/* Solo equipos activos: este diálogo únicamente crea recibos
                                nuevos (no hay edición), así que no hace falta preservar
                                un equipo inactivo ya elegido como sí pasa en Partidos. */}
                            {equipos?.filter((eq) => eq.activo).map(eq => <SelectItem key={eq.id} value={eq.id.toString()}>{eq.nombre}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="concepto"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Concepto</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              {CONCEPTOS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="monto"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Monto ($)</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="fecha"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fecha de Pago</FormLabel>
                          <FormControl><Input type="date" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="semana"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Semana asociada (opcional)</FormLabel>
                          <FormControl><Input type="number" {...field} value={field.value || ''} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <DialogFooter className="pt-4">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button type="submit" disabled={createMutation.isPending}>Registrar Pago</Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">N° Recibo</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6">Cargando...</TableCell></TableRow>
              ) : pagos?.map((pago) => (
                <TableRow key={pago.id}>
                  <TableCell className="font-mono text-muted-foreground font-bold">
                    {pago.codigoRecibo ?? (pago.nRecibo ? `#${pago.nRecibo.toString().padStart(4, '0')}` : '-')}
                  </TableCell>
                  <TableCell>{pago.fecha || '-'}</TableCell>
                  <TableCell className="font-bold">{pago.equipoNombre}</TableCell>
                  <TableCell>
                    <Badge variant={pago.concepto === 'Inscripcion' ? 'default' : 'secondary'}>
                      {pago.concepto}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-green-600">
                    {formatMoney(pago.monto)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setPagoRecibo(pago)} title="Ver recibo">
                      <Printer className="h-4 w-4" />
                    </Button>
                    {!readOnly && (
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(pago.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && pagos?.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No hay pagos registrados</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={pagoRecibo != null} onOpenChange={(v) => !v && setPagoRecibo(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Recibo de pago</DialogTitle>
          </DialogHeader>
          {pagoRecibo && (
            <ReciboPago
              pago={pagoRecibo}
              equipo={equipos?.find((e) => e.id === pagoRecibo.equipoId)}
              recibidoPor={user?.nombre}
              saldoInscripcion={saldoDelRecibo}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagoRecibo(null)}>Cerrar</Button>
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" /> Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copia oculta en pantalla, visible solo al imprimir: ver
          components/recibo-para-imprimir.tsx y el comentario junto a
          ".recibo-para-imprimir" en index.css. */}
      <ReciboParaImprimir
        pago={pagoRecibo}
        equipo={equipos?.find((e) => e.id === pagoRecibo?.equipoId)}
        recibidoPor={user?.nombre}
        saldoInscripcion={saldoDelRecibo}
      />
    </div>
  );
}
