import {
  useGetPartidos,
  useGetEquipos,
  useGetFases,
  useGetProgramacion,
  useUpdatePartido,
  useCreatePartido,
  useDeletePartido,
  getGetPartidosQueryKey,
} from '@workspace/api-client-react';
import type { Partido as PartidoApi } from '@workspace/api-client-react';
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
import { Plus, Edit2, Trash2, CheckCircle2, Printer } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { useAuth, canWrite, esDelComite } from '@/lib/auth';
import { extractErrorMessage } from '@/lib/api-errors';
import { formatHora12 } from '@/lib/utils';
import { PlanillaPartido } from '@/components/planilla-partido';
import { ImpresionPlanilla } from '@/components/planilla-imprimible';
import { SelectorArbitro } from '@/components/selector-arbitro';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

/**
 * Fases fijas del torneo (además de las que ya existan por haberse creado
 * antes desde "Armar fase" — grupos, liguilla, rondas de eliminación...).
 * El desplegable de este formulario solo deja elegir de la lista, nunca
 * escribir texto libre: así no se rompe el agrupamiento de Posiciones por
 * un nombre de fase mal escrito.
 */
const FASES_ELIMINACION_FIJAS = [
  // Va de primero porque en el torneo va de primero: el repechaje define
  // cuál es el último equipo que entra a cuartos, así que no puede haber
  // cuartos mientras no se juegue. Es el partido extra para desempatar
  // quién ocupa un cupo de la fase de grupos cuando un grupo queda con un
  // equipo de más (ej. 5 en vez de 4). No se etiqueta con el nombre del
  // grupo para no alterar su tabla de posiciones.
  'Repechaje',
  'Muerte súbita',
  'Final liguilla',
  'Semifinal liguilla',
  'Semifinal del torneo',
  'Final del torneo',
  '3er puesto',
];

const FASES_FIJAS = ['Primera vuelta', 'Segunda vuelta', ...FASES_ELIMINACION_FIJAS];

const partidoSchema = z.object({
  semana: z.coerce.number().min(1),
  fecha: z.string().optional(),
  hora: z.string().optional(),
  localId: z.coerce.number().min(1),
  visitanteId: z.coerce.number().min(1),
  fase: z.string().min(1, 'Selecciona la fase de este partido'),
  arbitroId: z.number().nullish(),
});

const resultadoSchema = z.object({
  golesLocal: z.coerce.number().min(0),
  golesVisitante: z.coerce.number().min(0),
  // Solo se usan si el partido es de eliminación y quedó empatado.
  penalesLocal: z.coerce.number().min(0).optional(),
  penalesVisitante: z.coerce.number().min(0).optional(),
});

/**
 * Lista de partidos con sus resultados. Es la pestaña "Partidos y
 * resultados" dentro de pages/partidos.tsx; `embebido` le quita el título
 * propio porque ahí lo pone la página madre.
 *
 * El filtro es por JORNADA del cronograma (no por número de semana): una
 * jornada puede abarcar varios fines de semana, así que se buscan sus
 * partidos por el rango de fechas que cubre. `jornadaId` viene de afuera
 * para que, al hacer clic en "ver partidos" desde el cronograma, esta
 * pestaña abra ya filtrada por esa jornada.
 */
export default function Partidos({
  embebido = false,
  jornadaId = 'all',
  onJornadaChange,
}: {
  embebido?: boolean;
  jornadaId?: number | 'all';
  onJornadaChange?: (id: number | 'all') => void;
}) {
  const { role } = useAuth();
  const readOnly = !canWrite(role, 'partidos');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Si la página no controla el filtro desde afuera (uso suelto), se maneja acá.
  const [jornadaLocal, setJornadaLocal] = useState<number | 'all'>('all');
  const jornadaActiva = onJornadaChange ? jornadaId : jornadaLocal;
  const cambiarJornada = (id: number | 'all') => {
    if (onJornadaChange) onJornadaChange(id);
    else setJornadaLocal(id);
  };

  const { data: equipos } = useGetEquipos();
  const { data: fasesExtra } = useGetFases();
  const { data: programacion } = useGetProgramacion();

  const jornada = (programacion ?? []).find((p) => p.id === jornadaActiva);
  const filtroPartidos =
    jornada?.fechaDesde && jornada?.fechaHasta
      ? { desde: jornada.fechaDesde, hasta: jornada.fechaHasta }
      : jornada
        ? { semana: jornada.semana } // jornada vieja, sin rango de fechas cargado
        : undefined;
  const { data: partidosRaw, isLoading } = useGetPartidos(filtroPartidos);

  // Lista de fases del desplegable: las fijas + cualquier otra que ya exista
  // en el torneo (grupos, liguilla, rondas de eliminación...), sin repetir.
  const opcionesFase = Array.from(new Set([...FASES_FIJAS, ...(fasesExtra ?? []).map((f) => f.nombre)]));

  const createMutation = useCreatePartido();
  const updateMutation = useUpdatePartido();
  const deletePartidoMutation = useDeletePartido();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [openResult, setOpenResult] = useState(false);
  const [activePartido, setActivePartido] = useState<any>(null);
  const [esWalkover, setEsWalkover] = useState(false);
  // Cuál partido se está mandando a la impresora. La planilla no viene con
  // la lista (hay que pedirla por partido), así que se guarda acá y el
  // componente de impresión la pide y la manda a imprimir solo.
  const [partidoAImprimir, setPartidoAImprimir] = useState<PartidoApi | null>(null);
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
    form.reset({ semana: 1, localId: 0, visitanteId: 0, fecha: '', hora: '', fase: '', arbitroId: null });
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
      arbitroId: partido.arbitroId ?? null,
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

  // Los penales solo tienen sentido en una fase de eliminación: en la liga
  // un empate simplemente reparte puntos. El tipo de la fase sale del
  // catálogo que lleva "Armar fase" (ver schema/fases.ts).
  const esEliminacionActiva =
    (fasesExtra ?? []).find((f) => f.nombre === activePartido?.fase)?.tipo === 'eliminacion' ||
    FASES_ELIMINACION_FIJAS.includes(activePartido?.fase ?? '');
  const golesEmpatados = resForm.watch('golesLocal') === resForm.watch('golesVisitante');
  const mostrarPenales = !esWalkover && esEliminacionActiva && golesEmpatados;

  const onResultSubmit = (data: z.infer<typeof resultadoSchema>) => {
    if (esWalkover && !walkoverGanadorId) {
      toast({ title: 'Selecciona qué equipo ganó el W.O.', variant: 'destructive' });
      return;
    }
    // Los penales solo se guardan si de verdad hubo definición desde el
    // punto penal (empate en una fase de eliminación). Si no, van en null
    // para no dejar un 0-0 de penales colgado en un partido de liga.
    const huboPenales = !esWalkover && esEliminacionActiva && data.golesLocal === data.golesVisitante;
    updateMutation.mutate(
      {
        id: activePartido.id,
        data: esWalkover
          ? { walkover: true, walkoverGanadorId: Number(walkoverGanadorId), jugado: true }
          : {
              golesLocal: data.golesLocal,
              golesVisitante: data.golesVisitante,
              penalesLocal: huboPenales ? (data.penalesLocal ?? 0) : null,
              penalesVisitante: huboPenales ? (data.penalesVisitante ?? 0) : null,
              walkover: false,
              jugado: true,
            },
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
    // La planilla lleva la nómina de los dos equipos: solo la abre el
    // comité. Quien está de consulta ve el marcador en la tabla y ya.
    if (readOnly) return;
    setActivePartido(partido);
    resForm.reset({
      golesLocal: partido.golesLocal ?? 0,
      golesVisitante: partido.golesVisitante ?? 0,
      penalesLocal: partido.penalesLocal ?? 0,
      penalesVisitante: partido.penalesVisitante ?? 0,
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        {!embebido && (
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Partidos</h1>
            <p className="text-muted-foreground mt-1">Programación y resultados</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <Select
            value={String(jornadaActiva)}
            onValueChange={(v) => cambiarJornada(v === 'all' ? 'all' : Number(v))}
          >
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Todas las jornadas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las jornadas</SelectItem>
              {(programacion ?? []).map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.nombreSemana || `Fecha ${p.semana}`}
                </SelectItem>
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
                      <FormField control={form.control} name="fase" render={({ field }) => {
                        // Si el partido ya tenía una fase que no está en la lista (dato
                        // viejo, de antes de que esto fuera obligatorio), se agrega igual
                        // para no perderla de vista al editar.
                        const opciones = field.value && !opcionesFase.includes(field.value)
                          ? [field.value, ...opcionesFase]
                          : opcionesFase;
                        return (
                          <FormItem>
                            <FormLabel>Fase</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ''}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Selecciona la fase" /></SelectTrigger></FormControl>
                              <SelectContent>
                                {opciones.map((f) => (
                                  <SelectItem key={f} value={f}>{f}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        );
                      }} />
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
                    <FormField control={form.control} name="arbitroId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Árbitro</FormLabel>
                        <FormControl>
                          <SelectorArbitro value={field.value} onChange={field.onChange} />
                        </FormControl>
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
                  {/* El W.O. también lleva planilla: es la constancia de
                      quién se presentó, que es lo que decide a cuál de los
                      dos equipos le toca la FOFI. */}
                  <PlanillaPartido
                    partido={activePartido}
                    readOnly={readOnly}
                    esWalkover={esWalkover}
                    onGuardado={() => setOpenResult(false)}
                  />
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

                      {/* En eliminación directa un empate no alcanza: hay que
                          definir desde el punto penal, y ese marcador se
                          guarda aparte (no cuenta como goles). */}
                      {mostrarPenales && (
                        <div className="border-t pt-4 space-y-2">
                          <p className="text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">
                            Definición por penales
                          </p>
                          <div className="flex justify-center items-center gap-6">
                            <FormField control={resForm.control} name="penalesLocal" render={({ field }) => (
                              <FormItem className="w-20">
                                <FormControl><Input type="number" className="text-center text-xl font-mono h-12" {...field} /></FormControl>
                              </FormItem>
                            )} />
                            <div className="text-lg font-bold text-muted-foreground">-</div>
                            <FormField control={resForm.control} name="penalesVisitante" render={({ field }) => (
                              <FormItem className="w-20">
                                <FormControl><Input type="number" className="text-center text-xl font-mono h-12" {...field} /></FormControl>
                              </FormItem>
                            )} />
                          </div>
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

      {partidoAImprimir && (
        <ImpresionPlanilla
          partido={partidoAImprimir}
          colorLocal={equipos?.find((eq) => eq.id === partidoAImprimir.localId)?.color}
          colorVisitante={equipos?.find((eq) => eq.id === partidoAImprimir.visitanteId)?.color}
          onTerminado={() => setPartidoAImprimir(null)}
        />
      )}

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
                <TableHead>Fase</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-6">Cargando...</TableCell></TableRow>
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
                  <TableCell className="text-xs text-muted-foreground">{partido.fase || '—'}</TableCell>
                  <TableCell className="text-center">
                    {partido.jugado ? (
                      <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Finalizado</Badge>
                    ) : (
                      <Badge variant="secondary">Programado</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-1 whitespace-nowrap">
                    {/* La copia del acta para cada delegado. Solo cuando el
                        partido ya está diligenciado: antes de eso no hay nada
                        que imprimir. */}
                    {esDelComite(role) && partido.jugado && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPartidoAImprimir(partido)}
                        aria-label={`Imprimir planilla de ${partido.localNombre} vs ${partido.visitanteNombre}`}
                        title="Imprimir la planilla del partido"
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    )}
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
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No hay partidos en esta fecha</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
