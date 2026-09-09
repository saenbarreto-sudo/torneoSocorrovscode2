import {
  useGetPartidos,
  useGetEquipos,
  useUpdatePartido,
  useCreatePartido,
  useDeletePartido,
  getGetPartidosQueryKey,
} from '@workspace/api-client-react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Edit2, Trash2, CheckCircle2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { useAuth, canWrite } from '@/lib/auth';
import { extractErrorMessage } from '@/lib/api-errors';
import { formatHora12 } from '@/lib/utils';
import { PlanillaPartido } from '@/components/planilla-partido';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

const partidoSchema = z.object({
  semana: z.coerce.number().min(1),
  fecha: z.string().optional(),
  hora: z.string().optional(),
  localId: z.coerce.number().min(1),
  visitanteId: z.coerce.number().min(1),
  fase: z.string().optional(),
  arbitro: z.string().optional(),
});

const resultadoSchema = z.object({
  golesLocal: z.coerce.number().min(0),
  golesVisitante: z.coerce.number().min(0),
});

export default function Partidos() {
  const { role } = useAuth();
  const readOnly = !canWrite(role, 'partidos');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [filtroSemana, setFiltroSemana] = useState<string>('all');

  const { data: equipos } = useGetEquipos();
  const { data: partidosRaw, isLoading } = useGetPartidos(
    filtroSemana !== 'all' ? { semana: Number(filtroSemana) } : undefined,
  );

  const createMutation = useCreatePartido();
  const updateMutation = useUpdatePartido();
  const deletePartidoMutation = useDeletePartido();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [openResult, setOpenResult] = useState(false);
  const [activePartido, setActivePartido] = useState<any>(null);
  const [esWalkover, setEsWalkover] = useState(false);
  const [walkoverGanadorId, setWalkoverGanadorId] = useState<string>('');

  const form = useForm<z.infer<typeof partidoSchema>>({
    resolver: zodResolver(partidoSchema),
    defaultValues: { semana: 1, localId: 0, visitanteId: 0 },
  });

  const resForm = useForm<z.infer<typeof resultadoSchema>>({
    resolver: zodResolver(resultadoSchema),
    defaultValues: { golesLocal: 0, golesVisitante: 0 },
  });

  const openNew = () => {
    setEditingId(null);
    form.reset({ semana: 1, localId: 0, visitanteId: 0, fecha: '', hora: '', fase: '', arbitro: '' });
    setOpen(true);
  };

  const openEdit = (partido: any) => {
    setEditingId(partido.id);
    form.reset({
      semana: partido.semana,
      fecha: partido.fecha ?? '',
      hora: partido.hora ?? '',
      localId: partido.localId,
      visitanteId: partido.visitanteId,
      fase: partido.fase ?? '',
      arbitro: partido.arbitro ?? '',
    });
    setOpen(true);
  };

  const onSubmit = (data: z.infer<typeof partidoSchema>) => {
    if (data.localId === data.visitanteId) {
      toast({ title: 'Error', description: 'Un equipo no puede jugar contra sí mismo', variant: 'destructive' });
      return;
    }

    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: getGetPartidosQueryKey() });
      toast({ title: editingId ? 'Partido actualizado' : 'Partido programado' });
      setOpen(false);
      form.reset();
      setEditingId(null);
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data }, { onSuccess });
    } else {
      createMutation.mutate({ data: { ...data, jugado: false } }, { onSuccess });
    }
  };

  const handleDeletePartido = (id: number) => {
    deletePartidoMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPartidosQueryKey() });
        toast({ title: 'Partido eliminado' });
      },
      onError: (err: any) => {
        toast({ title: 'No se pudo eliminar', description: extractErrorMessage(err), variant: 'destructive' });
      },
    });
  };

  const onResultSubmit = (data: z.infer<typeof resultadoSchema>) => {
    if (esWalkover && !walkoverGanadorId) {
      toast({ title: 'Selecciona qué equipo ganó el W.O.', variant: 'destructive' });
      return;
    }
    updateMutation.mutate(
      {
        id: activePartido.id,
        data: esWalkover
          ? { walkover: true, walkoverGanadorId: Number(walkoverGanadorId), jugado: true }
          : { ...data, walkover: false, jugado: true },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPartidosQueryKey() });
          queryClient.invalidateQueries({ queryKey: ['/api/posiciones'] });
          toast({ title: 'Resultado registrado' });
        },
        onError: (err: any) => {
          toast({ title: 'No se pudo registrar', description: extractErrorMessage(err), variant: 'destructive' });
        },
      },
    );
  };

  const openRegisterResult = (partido: any) => {
    setActivePartido(partido);
    resForm.reset({
      golesLocal: partido.golesLocal ?? 0,
      golesVisitante: partido.golesVisitante ?? 0,
    });
    setEsWalkover(!!partido.walkover);
    setWalkoverGanadorId(partido.walkoverGanadorId ? String(partido.walkoverGanadorId) : '');
    setOpenResult(true);
  };

  // Por fecha real, no por número de semana: con fecha por partido, una
  // misma semana puede tener partidos sábado y domingo, y el número de
  // semana no siempre seguía el orden real del calendario (se reinicia
  // cada año). Sin fecha, al final. Dentro del mismo día, por hora.
  const partidos = partidosRaw?.sort((a, b) => {
    if (a.fecha !== b.fecha) {
      if (!a.fecha) return 1;
      if (!b.fecha) return -1;
      return a.fecha.localeCompare(b.fecha);
    }
    return (a.hora || '').localeCompare(b.hora || '');
  }) || [];

  // Extraer semanas unicas para el filtro
  const semanasUnicas = Array.from(new Set(partidosRaw?.map((p) => p.semana) || [])).sort((a, b) => b - a);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Partidos</h1>
          <p className="text-muted-foreground mt-1">Programación y resultados</p>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <Select value={filtroSemana} onValueChange={setFiltroSemana}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Todas las fechas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las fechas</SelectItem>
              {semanasUnicas.map((sem) => (
                <SelectItem key={sem} value={sem.toString()}>Fecha {sem}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!readOnly && (
            <Dialog
              open={open}
              onOpenChange={(v) => {
                setOpen(v);
                if (!v) setEditingId(null);
              }}
            >
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto" onClick={openNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Programar Partido
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingId ? 'Editar Partido' : 'Programar Partido'}</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField control={form.control} name="semana" render={({ field }) => (
                        <FormItem><FormLabel>Fecha N° / Semana</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="fase" render={({ field }) => (
                        <FormItem><FormLabel>Fase (Opcional)</FormLabel><FormControl><Input placeholder="Ej: Semifinal" {...field} /></FormControl></FormItem>
                      )} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField control={form.control} name="fecha" render={({ field }) => (
                        <FormItem><FormLabel>Fecha (Día)</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="hora" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hora</FormLabel>
                          <FormControl><Input type="time" {...field} /></FormControl>
                          {field.value && (
                            <p className="text-xs text-muted-foreground">Se mostrará como {formatHora12(field.value)}</p>
                          )}
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="arbitro" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Árbitro</FormLabel>
                        <FormControl><Input placeholder="Nombre del árbitro asignado" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <div className="space-y-4 p-4 border rounded-md bg-muted/20">
                      <FormField control={form.control} name="localId" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Equipo Local</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ? field.value.toString() : ''}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Seleccione local" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {equipos
                                ?.filter((eq) => eq.activo || eq.id === field.value)
                                .map((eq) => (
                                  <SelectItem key={eq.id} value={eq.id.toString()}>
                                    {eq.nombre}{!eq.activo && ' (inactivo)'}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <div className="text-center font-bold text-muted-foreground">VS</div>
                      <FormField control={form.control} name="visitanteId" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Equipo Visitante</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ? field.value.toString() : ''}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Seleccione visitante" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {equipos
                                ?.filter((eq) => eq.activo || eq.id === field.value)
                                .map((eq) => (
                                  <SelectItem key={eq.id} value={eq.id.toString()}>
                                    {eq.nombre}{!eq.activo && ' (inactivo)'}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                        {editingId ? 'Guardar cambios' : 'Programar'}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Dialog open={openResult} onOpenChange={setOpenResult}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {activePartido?.jugado ? 'Corregir planilla del partido' : 'Planilla del partido'}
            </DialogTitle>
          </DialogHeader>
          {activePartido && (
            <div className="py-2">
              <div className="flex justify-between items-center text-lg font-bold mb-1 px-4">
                <div className="w-1/3 text-right">{activePartido.localNombre}</div>
                <div className="w-1/3 text-center text-muted-foreground font-mono">VS</div>
                <div className="w-1/3 text-left">{activePartido.visitanteNombre}</div>
              </div>
              <p className="text-center text-xs text-muted-foreground mb-4">
                Fecha {activePartido.semana}
                {activePartido.fecha ? ` · ${activePartido.fecha}` : ''}
                {activePartido.hora ? ` · ${formatHora12(activePartido.hora)}` : ''}
              </p>

              <Tabs defaultValue="planilla" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="planilla">Planilla</TabsTrigger>
                  <TabsTrigger value="marcador">W.O. / Marcador</TabsTrigger>
                </TabsList>

                <TabsContent value="planilla" className="pt-4">
                  {esWalkover ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      Este partido está marcado como W.O.: el marcador es 6-0 y no lleva planilla.
                    </p>
                  ) : (
                    <PlanillaPartido
                      partido={activePartido}
                      readOnly={readOnly}
                      onGuardado={() => setOpenResult(false)}
                    />
                  )}
                </TabsContent>

                <TabsContent value="marcador" className="pt-4">
                  <Form {...resForm}>
                    <form onSubmit={resForm.handleSubmit(onResultSubmit)} className="space-y-4">
                      {!readOnly && (
                        <label className="flex items-center gap-2 text-sm font-medium justify-center">
                          <input
                            type="checkbox"
                            checked={esWalkover}
                            onChange={(e) => setEsWalkover(e.target.checked)}
                          />
                          Ganado por W.O. (marcador oficial 6-0, Art. 23)
                        </label>
                      )}

                      {esWalkover ? (
                        <div className="max-w-xs mx-auto space-y-2">
                          <Label className="text-xs">¿Quién ganó el W.O.?</Label>
                          <Select value={walkoverGanadorId} onValueChange={setWalkoverGanadorId} disabled={readOnly}>
                            <SelectTrigger><SelectValue placeholder="Seleccionar equipo" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={String(activePartido.localId)}>{activePartido.localNombre}</SelectItem>
                              <SelectItem value={String(activePartido.visitanteId)}>{activePartido.visitanteNombre}</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground text-center">
                            Se registrará 6-0 a favor del equipo ganador. No se deben cargar goleadores individuales.
                          </p>
                        </div>
                      ) : (
                        <div className="flex justify-center items-center gap-6">
                          <FormField control={resForm.control} name="golesLocal" render={({ field }) => (
                            <FormItem className="w-24">
                              <FormControl><Input type="number" className="text-center text-2xl font-mono h-16" {...field} /></FormControl>
                            </FormItem>
                          )} />
                          <div className="text-xl font-bold text-muted-foreground">-</div>
                          <FormField control={resForm.control} name="golesVisitante" render={({ field }) => (
                            <FormItem className="w-24">
                              <FormControl><Input type="number" className="text-center text-2xl font-mono h-16" {...field} /></FormControl>
                            </FormItem>
                          )} />
                        </div>
                      )}
                      {!readOnly && (
                        <DialogFooter className="mt-4">
                          <Button type="button" variant="outline" onClick={() => setOpenResult(false)}>Cerrar</Button>
                          <Button type="submit" disabled={updateMutation.isPending}>Guardar Resultado</Button>
                        </DialogFooter>
                      )}
                    </form>
                  </Form>
                </TabsContent>

              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20 text-center">Fecha N°</TableHead>
                <TableHead>Día/Hora</TableHead>
                <TableHead className="text-right">Local</TableHead>
                <TableHead className="text-center w-24">Resultado</TableHead>
                <TableHead>Visitante</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-6">Cargando...</TableCell></TableRow>
              ) : partidos.map((partido) => (
                <TableRow key={partido.id}>
                  <TableCell className="text-center font-mono font-bold">{partido.semana}</TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{partido.fecha || 'Sin fecha'}</div>
                    <div className="text-xs text-muted-foreground">{formatHora12(partido.hora)}</div>
                  </TableCell>
                  <TableCell className="text-right font-bold">{partido.localNombre}</TableCell>
                  <TableCell className="text-center">
                    <div className="px-3 py-1 bg-muted rounded font-mono font-bold text-lg inline-block">
                      {partido.jugado ? `${partido.golesLocal} - ${partido.golesVisitante}` : 'vs'}
                    </div>
                    {partido.walkover && (
                      <div className="text-[10px] font-semibold text-amber-600 mt-0.5">W.O.</div>
                    )}
                  </TableCell>
                  <TableCell className="font-bold">{partido.visitanteNombre}</TableCell>
                  <TableCell className="text-center">
                    {partido.jugado ? (
                      <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Finalizado</Badge>
                    ) : (
                      <Badge variant="secondary">Programado</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-1 whitespace-nowrap">
                    {!readOnly && (
                      <>
                        <Button variant={partido.jugado ? 'ghost' : 'default'} size="sm" onClick={() => openRegisterResult(partido)}>
                          {partido.jugado ? 'Ver / corregir' : 'Llenar planilla'}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(partido)} aria-label="Editar partido">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Eliminar partido">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar este partido?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Se eliminará el partido {partido.localNombre} vs {partido.visitanteNombre} (Fecha {partido.semana}).
                                Esta acción no se puede deshacer.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeletePartido(partido.id)}>Eliminar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && partidos.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No hay partidos en esta fecha</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
