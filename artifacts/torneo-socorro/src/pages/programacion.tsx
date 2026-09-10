import { useState } from 'react';
import {
  useGetProgramacion,
  useUpdateSemanaFecha,
  useDeleteSemanaFecha,
  getGetProgramacionQueryKey,
  getGetPartidosQueryKey,
  getGetPartidosQueryOptions,
  type SemanaFecha,
  type Partido,
} from '@workspace/api-client-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CalendarDays, CalendarPlus, Edit2, Trash2, Printer, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { useAuth, canWrite } from '@/lib/auth';
import { extractErrorMessage } from '@/lib/api-errors';
import { ImprimirPortal } from '@/components/imprimir-portal';
import { ProgramacionImprimible } from '@/components/programacion-imprimible';
import { formatFechaConDia } from '@/lib/utils';

const semanaSchema = z.object({
  semana: z.coerce.number().min(1),
  nombreSemana: z.string().optional(),
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  esFestivo: z.boolean().default(false),
});

export default function Programacion() {
  const { data: programacion, isLoading } = useGetProgramacion();
  const [, navigate] = useLocation();
  const { role } = useAuth();
  const puedeProgramar = canWrite(role, 'partidos');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateMutation = useUpdateSemanaFecha();
  const deleteMutation = useDeleteSemanaFecha();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [semanaImprimir, setSemanaImprimir] = useState<SemanaFecha | null>(null);

  // useGetPartidos({ query: { enabled } }) no compila: ver el mismo comentario
  // en pagos-resumen.tsx — el tipo generado exige "queryKey" en ese objeto
  // aunque en tiempo de ejecución sí es opcional.
  //
  // Se busca por rango de fechas (fechaDesde–fechaHasta), no por número de
  // semana: con fecha por partido, una sola Programación puede agrupar
  // partidos de varias semanas distintas. Si la fila no tiene fechas (una
  // vieja, o creada a mano sin rango), se cae al número de semana exacto —
  // mismo criterio que usa el borrado en cascada del backend.
  const parametrosPartidosSemana = semanaImprimir
    ? semanaImprimir.fechaDesde && semanaImprimir.fechaHasta
      ? { desde: semanaImprimir.fechaDesde, hasta: semanaImprimir.fechaHasta }
      : { semana: semanaImprimir.semana }
    : undefined;
  const { data: partidosDeLaSemana } = useQuery<Partido[]>({
    ...getGetPartidosQueryOptions(parametrosPartidosSemana),
    enabled: semanaImprimir != null,
  });

  // Una Programación puede cubrir varias fechas (toda una fase de grupos,
  // por ejemplo), pero lo que casi siempre se quiere imprimir es un fin de
  // semana puntual — así que se arranca marcando solo la fecha más próxima,
  // y el usuario agrega o quita fechas si de verdad quiere imprimir más de
  // un fin de semana de una vez.
  const [fechasImprimirInicializadaPara, setFechasImprimirInicializadaPara] = useState<number | null>(null);
  const [fechasElegidas, setFechasElegidas] = useState<Set<string>>(new Set());

  const fechasDisponibles = [...new Set((partidosDeLaSemana ?? []).map((p) => p.fecha ?? ''))].sort();

  if (semanaImprimir && fechasImprimirInicializadaPara !== semanaImprimir.id && fechasDisponibles.length > 0) {
    setFechasElegidas(new Set([fechasDisponibles[0]]));
    setFechasImprimirInicializadaPara(semanaImprimir.id);
  }

  const partidosParaImprimir = (partidosDeLaSemana ?? []).filter((p) => fechasElegidas.has(p.fecha ?? ''));

  const alternarFecha = (fecha: string) => {
    setFechasElegidas((previo) => {
      const copia = new Set(previo);
      if (copia.has(fecha)) copia.delete(fecha);
      else copia.add(fecha);
      return copia;
    });
  };

  const form = useForm<z.infer<typeof semanaSchema>>({
    resolver: zodResolver(semanaSchema),
    defaultValues: { semana: 1, nombreSemana: '', fechaDesde: '', fechaHasta: '', esFestivo: false },
  });

  const openEdit = (prog: SemanaFecha) => {
    setEditingId(prog.id);
    form.reset({
      semana: prog.semana,
      nombreSemana: prog.nombreSemana ?? '',
      fechaDesde: prog.fechaDesde ?? '',
      fechaHasta: prog.fechaHasta ?? '',
      esFestivo: prog.esFestivo,
    });
    setOpen(true);
  };

  const onSubmit = (data: z.infer<typeof semanaSchema>) => {
    if (!editingId) return;
    updateMutation.mutate(
      { id: editingId, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProgramacionQueryKey() });
          toast({ title: 'Semana actualizada' });
          setOpen(false);
          form.reset();
          setEditingId(null);
        },
        onError: (err: unknown) => {
          toast({ title: 'No se pudo guardar', description: extractErrorMessage(err), variant: 'destructive' });
        },
      },
    );
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: (resultado) => {
          queryClient.invalidateQueries({ queryKey: getGetProgramacionQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPartidosQueryKey() });
          toast({
            title: 'Semana eliminada',
            description: resultado.partidosEliminados > 0
              ? `${resultado.partidosEliminados} ${resultado.partidosEliminados === 1 ? 'partido programado en ella se eliminó' : 'partidos programados en ella se eliminaron'} también.`
              : undefined,
          });
        },
        onError: (err: unknown) => {
          toast({ title: 'No se pudo eliminar', description: extractErrorMessage(err), variant: 'destructive' });
        },
      },
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 text-primary rounded-lg">
            <CalendarDays className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Cronograma del Torneo</h1>
            <p className="text-muted-foreground mt-1">Fechas y semanas programadas</p>
          </div>
        </div>
        {puedeProgramar && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/programacion/armar-fase')}>
              <Trophy className="h-4 w-4 mr-2" /> Armar fase
            </Button>
            <Button onClick={() => navigate('/programacion/generar')}>
              <CalendarPlus className="h-4 w-4 mr-2" /> Generar calendario
            </Button>
          </div>
        )}
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
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10">Cargando cronograma...</TableCell>
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
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setSemanaImprimir(prog)} aria-label="Imprimir semana">
                      <Printer className="h-4 w-4" />
                    </Button>
                    {puedeProgramar && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(prog)} aria-label="Editar semana">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Eliminar semana">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar esta semana del cronograma?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Se eliminará "{prog.nombreSemana || `Fecha ${prog.semana}`}" de la Programación, y con
                                ella <span className="font-semibold text-destructive">todos los partidos programados en esa semana</span> (con
                                sus goles, tarjetas y planilla). Esta acción no se puede deshacer.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(prog.id)}>Eliminar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && programacion?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    No hay programación definida.
                    {puedeProgramar && (
                      <div className="mt-3 flex gap-2 justify-center">
                        <Button variant="outline" onClick={() => navigate('/programacion/generar')}>
                          <CalendarPlus className="h-4 w-4 mr-2" /> Generar el calendario del torneo
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Editar semana */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditingId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar semana</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="semana" render={({ field }) => (
                  <FormItem><FormLabel>Semana N°</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="nombreSemana" render={({ field }) => (
                  <FormItem><FormLabel>Nombre / Descripción</FormLabel><FormControl><Input placeholder="Ej: Semana 27" {...field} /></FormControl></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="fechaDesde" render={({ field }) => (
                  <FormItem><FormLabel>Fecha inicio</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="fechaHasta" render={({ field }) => (
                  <FormItem><FormLabel>Fecha fin</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="esFestivo" render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 rounded-md border p-3">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Semana festiva</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Solo es descriptivo, para que se vea marcada en el cronograma.
                    </p>
                  </div>
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="submit" disabled={updateMutation.isPending}>
                  Guardar cambios
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Vista previa e impresión de una semana */}
      <Dialog open={semanaImprimir != null} onOpenChange={(v) => !v && setSemanaImprimir(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cronograma de la semana</DialogTitle>
          </DialogHeader>
          {fechasDisponibles.length > 1 && (
            <div className="flex flex-wrap gap-x-4 gap-y-2 border-b pb-3">
              {fechasDisponibles.map((fecha) => (
                <label key={fecha || 'sin-fecha'} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={fechasElegidas.has(fecha)} onCheckedChange={() => alternarFecha(fecha)} />
                  {fecha ? formatFechaConDia(fecha) : 'Sin fecha'}
                </label>
              ))}
            </div>
          )}
          {semanaImprimir && (
            <ProgramacionImprimible semana={semanaImprimir} partidos={partidosParaImprimir} />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSemanaImprimir(null)}>Cerrar</Button>
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" /> Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copia oculta en pantalla, visible solo al imprimir: ver
          components/imprimir-portal.tsx. */}
      <ImprimirPortal activo={semanaImprimir != null}>
        {semanaImprimir && (
          <ProgramacionImprimible semana={semanaImprimir} partidos={partidosParaImprimir} />
        )}
      </ImprimirPortal>
    </div>
  );
}
