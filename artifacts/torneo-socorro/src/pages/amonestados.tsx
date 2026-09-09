import { useState } from 'react';
import {
  useGetAmonestados,
  useGetTarjetas,
  useGetSanciones,
  useGetJugadores,
  useCreatePago,
  useUpdateTarjeta,
  useDeleteTarjeta,
  getGetAmonestadosQueryKey,
  getGetTarjetasQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Flag, DollarSign, Edit2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth, canWrite } from '@/lib/auth';
import { extractErrorMessage } from '@/lib/api-errors';
import { Badge } from '@/components/ui/badge';


export default function Amonestados() {
  const { role } = useAuth();
  const puedeMarcarPago = canWrite(role, 'pagos');
  const puedeEditarTarjetas = canWrite(role, 'tarjetas');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: amonestados, isLoading } = useGetAmonestados();
  const { data: tarjetas, isLoading: isLoadingTarjetas } = useGetTarjetas();
  const { data: sanciones } = useGetSanciones();
  const { data: jugadores } = useGetJugadores();

  const createPagoMutation = useCreatePago();
  const updateMutation = useUpdateTarjeta();
  const deleteMutation = useDeleteTarjeta();
  const [payingId, setPayingId] = useState<number | null>(null);
  const [cobrando, setCobrando] = useState<(NonNullable<typeof tarjetas>[number]) | null>(null);
  const [fechaPago, setFechaPago] = useState('');
  const [montoPago, setMontoPago] = useState('');

  const [filtroEquipo, setFiltroEquipo] = useState<string>('all');
  const [orden, setOrden] = useState<'fecha-desc' | 'fecha-asc' | 'equipo'>('fecha-desc');
  const [editing, setEditing] = useState<(NonNullable<typeof tarjetas>[number]) | null>(null);
  const [editValor, setEditValor] = useState('');
  const [editSancion, setEditSancion] = useState('');

  const equiposDisponibles = Array.from(new Set((tarjetas ?? []).map((t) => t.equipoNombre))).sort((a, b) =>
    a.localeCompare(b),
  );

  const todas = (tarjetas ?? [])
    .filter((t) => filtroEquipo === 'all' || t.equipoNombre === filtroEquipo)
    .sort((a, b) => {
      if (orden === 'equipo') return a.equipoNombre.localeCompare(b.equipoNombre);
      const fa = a.fecha ?? '';
      const fb = b.fecha ?? '';
      return orden === 'fecha-asc' ? fa.localeCompare(fb) || a.semana - b.semana : fb.localeCompare(fa) || b.semana - a.semana;
    });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getGetTarjetasQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAmonestadosQueryKey() });
  };

  /** Abre el diálogo de cobro con la fecha de hoy por defecto. */
  const abrirCobro = (tarjeta: (typeof todas)[number]) => {
    setCobrando(tarjeta);
    setFechaPago(new Date().toISOString().split('T')[0]);
    setMontoPago(tarjeta.valor != null ? String(tarjeta.valor) : '');
  };

  const confirmarPago = () => {
    if (!cobrando) return;
    const equipoId = jugadores?.find((j) => j.id === cobrando.jugadorId)?.equipoId;
    if (!equipoId) {
      toast({ title: 'No se pudo determinar el equipo del jugador', variant: 'destructive' });
      return;
    }
    if (!fechaPago) {
      toast({ title: 'Indica la fecha en que se recibió el pago', variant: 'destructive' });
      return;
    }
    setPayingId(cobrando.id);
    createPagoMutation.mutate(
      {
        data: {
          equipoId,
          concepto: cobrando.tipo === 'roja' ? 'Rojas' : 'Amarillas',
          monto: Number(montoPago) || 0,
          fecha: fechaPago,
          tarjetaId: cobrando.id,
        },
      },
      {
        onSuccess: () => {
          invalidateAll();
          queryClient.invalidateQueries({ queryKey: ['/api/pagos'] });
          toast({
            title: 'Pago registrado',
            description: `${cobrando.jugadorNombre} queda al día. El recibo quedó en Pagos y Multas.`,
          });
          setPayingId(null);
          setCobrando(null);
        },
        onError: (err) => {
          toast({ title: 'No se pudo registrar el pago', description: extractErrorMessage(err, 'Intenta de nuevo'), variant: 'destructive' });
          setPayingId(null);
        },
      },
    );
  };

  const openEdit = (tarjeta: (typeof todas)[number]) => {
    setEditing(tarjeta);
    setEditValor(tarjeta.valor != null ? String(tarjeta.valor) : '');
    setEditSancion(tarjeta.sancion ?? '');
  };

  const guardarEdicion = () => {
    if (!editing) return;
    if (editing.tipo === 'amarilla' && (!editValor || Number(editValor) <= 0)) {
      toast({ title: 'El valor de la multa es obligatorio para tarjeta amarilla', variant: 'destructive' });
      return;
    }
    updateMutation.mutate(
      {
        id: editing.id,
        data: {
          valor: editValor ? Number(editValor) : undefined,
          sancion: editing.tipo === 'roja' && editSancion ? editSancion : undefined,
        },
      },
      {
        onSuccess: () => {
          invalidateAll();
          toast({ title: 'Tarjeta actualizada' });
          setEditing(null);
        },
        onError: (err) => {
          toast({ title: 'No se pudo actualizar', description: extractErrorMessage(err, 'Intenta de nuevo'), variant: 'destructive' });
        },
      },
    );
  };

  const eliminarTarjeta = (id: number) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          invalidateAll();
          toast({ title: 'Tarjeta eliminada' });
        },
        onError: (err) => {
          toast({
            title: 'No se pudo eliminar',
            description: extractErrorMessage(err, 'Ocurrió un error inesperado, intenta de nuevo.'),
            variant: 'destructive',
          });
        },
      },
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-red-100 text-red-600 rounded-lg">
          <Flag className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Amonestados</h1>
          <p className="text-muted-foreground mt-1">Control de tarjetas y sanciones</p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground -mt-2">
        Los goles y tarjetas se registran desde <span className="font-semibold">Partidos y Resultados</span>, al registrar el
        resultado de cada encuentro. Aquí puedes corregir o eliminar una tarjeta mal colocada.
      </p>

      <Dialog open={!!cobrando} onOpenChange={(v) => !v && setCobrando(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar pago de la multa</DialogTitle></DialogHeader>
          {cobrando && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="font-semibold">{cobrando.jugadorNombre}</p>
                <p className="text-muted-foreground">
                  {cobrando.equipoNombre} · Tarjeta {cobrando.tipo} · Fecha {cobrando.semana}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fecha-pago">Fecha del pago</Label>
                <Input
                  id="fecha-pago"
                  type="date"
                  value={fechaPago}
                  onChange={(e) => setFechaPago(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Es la fecha en que se recibió el dinero; así queda en el recibo.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="monto-pago">Valor recibido</Label>
                <Input
                  id="monto-pago"
                  type="number"
                  min={0}
                  value={montoPago}
                  onChange={(e) => setMontoPago(e.target.value)}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCobrando(null)}>Cancelar</Button>
                <Button
                  type="button"
                  onClick={confirmarPago}
                  disabled={createPagoMutation.isPending && payingId === cobrando.id}
                >
                  Registrar pago
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar tarjeta</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Jugador</Label>
                <p className="font-semibold">{editing.jugadorNombre} · {editing.equipoNombre}</p>
              </div>
              <div>
                <Label className="text-xs">
                  Valor {editing.tipo === 'amarilla' ? '(obligatorio)' : '(opcional)'}
                </Label>
                <Input type="number" min={0} value={editValor} onChange={(e) => setEditValor(e.target.value)} />
              </div>
              {editing.tipo === 'roja' && (
                <div>
                  <Label className="text-xs">Sanción en fechas (opcional)</Label>
                  <Input placeholder="Ej: 2 fechas" value={editSancion} onChange={(e) => setEditSancion(e.target.value)} />
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
                <Button type="button" onClick={guardarEdicion} disabled={updateMutation.isPending}>Guardar</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Flag className="h-4 w-4" /> Sanciones vigentes
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jugador</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead className="text-center">Desde</TableHead>
                <TableHead className="text-center">Cumplidas</TableHead>
                <TableHead className="text-center">Pendientes</TableHead>
                <TableHead className="text-center">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sanciones ?? []).map((s) => (
                <TableRow key={s.tarjetaId} className={s.fechasPendientes > 0 ? 'bg-accent/40' : ''}>
                  <TableCell className="font-bold">{s.jugadorNombre}</TableCell>
                  <TableCell><Badge variant="outline">{s.equipoNombre}</Badge></TableCell>
                  <TableCell className="text-center font-mono text-sm">
                    Fecha {s.semana}
                  </TableCell>
                  <TableCell className="text-center font-mono tabular-nums">
                    {s.fechasCumplidas} / {s.fechasSancion}
                  </TableCell>
                  <TableCell className="text-center font-mono font-bold tabular-nums text-lg">
                    {s.fechasPendientes}
                  </TableCell>
                  <TableCell className="text-center">
                    {s.fechasPendientes > 0 ? (
                      <Badge variant="destructive">No puede jugar</Badge>
                    ) : (
                      <Badge variant="success">Habilitado</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(sanciones ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                    No hay sanciones en fechas registradas.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground -mt-2">
        Las fechas se descuentan solas: cada vez que el equipo juega un partido y el jugador no
        aparece en la planilla, se le abona una fecha cumplida.
      </p>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Tarjetas registradas
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Select value={filtroEquipo} onValueChange={setFiltroEquipo}>
              <SelectTrigger className="w-full sm:w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los equipos</SelectItem>
                {equiposDisponibles.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={orden} onValueChange={(v) => setOrden(v as typeof orden)}>
              <SelectTrigger className="w-full sm:w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fecha-desc">Fecha: más reciente</SelectItem>
                <SelectItem value="fecha-asc">Fecha: más antigua</SelectItem>
                <SelectItem value="equipo">Equipo: A → Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Carné</TableHead>
                <TableHead>Jugador</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead className="text-center">Tipo</TableHead>
                <TableHead className="text-center">Fecha</TableHead>
                <TableHead className="text-center">Jornada</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingTarjetas ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-6">Cargando...</TableCell>
                </TableRow>
              ) : todas.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-muted-foreground">
                    {t.nCarnet ? `#${String(t.nCarnet).padStart(4, '0')}` : '-'}
                  </TableCell>
                  <TableCell className="font-bold">{t.jugadorNombre}</TableCell>
                  <TableCell><Badge variant="outline">{t.equipoNombre}</Badge></TableCell>
                  <TableCell className="text-center">
                    <Badge variant={t.tipo === 'roja' ? 'destructive' : 'warning'}>{t.tipo}</Badge>
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm">{t.fecha || '-'}</TableCell>
                  <TableCell className="text-center font-mono">{t.semana}</TableCell>
                  <TableCell className="text-right font-mono">
                    {t.valor ? `$${t.valor.toLocaleString()}` : '-'}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-1">
                      {t.pagada ? <Badge variant="success">Pagada</Badge> : <Badge variant="secondary">Pendiente</Badge>}
                      {t.tipo === 'roja' && t.sancion && (
                        <span className="text-[10px] text-muted-foreground">{t.sancion}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap space-x-1">
                    {puedeMarcarPago && !t.pagada && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={createPagoMutation.isPending && payingId === t.id}
                        onClick={() => abrirCobro(t)}
                      >
                        Marcar pagada
                      </Button>
                    )}
                    {puedeEditarTarjetas && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(t)} aria-label="Editar tarjeta">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Eliminar tarjeta">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar esta tarjeta?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Se eliminará la tarjeta {t.tipo} de {t.jugadorNombre} ({t.equipoNombre}). Si ya tiene un pago
                                asociado, no se podrá eliminar hasta borrar ese pago primero.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => eliminarTarjeta(t.id)}>Eliminar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!isLoadingTarjetas && todas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                    No hay tarjetas registradas
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumen de fair play por jugador</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Carné</TableHead>
                <TableHead>Jugador</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead className="text-center">Amarillas</TableHead>
                <TableHead className="text-center">Rojas</TableHead>
                <TableHead className="text-right">Fechas de Sanción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6">Cargando...</TableCell></TableRow>
              ) : amonestados?.map((am) => (
                <TableRow key={`${am.jugadorId}-${am.equipoNombre}`}>
                  <TableCell className="font-mono text-muted-foreground">
                    {am.nCarnet ? `#${String(am.nCarnet).padStart(4, '0')}` : '-'}
                  </TableCell>
                  <TableCell className="font-bold">{am.jugadorNombre}</TableCell>
                  <TableCell><Badge variant="outline">{am.equipoNombre}</Badge></TableCell>
                  <TableCell className="text-center">
                    {am.amarillas > 0 ? (
                      <div className="flex items-center justify-center gap-1 font-mono font-bold">
                        <div className="w-3 h-4 bg-yellow-400 rounded-sm"></div>
                        {am.amarillas}
                      </div>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="text-center">
                    {am.rojas > 0 ? (
                      <div className="flex items-center justify-center gap-1 font-mono font-bold text-red-600">
                        <div className="w-3 h-4 bg-red-600 rounded-sm"></div>
                        {am.rojas}
                      </div>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground font-mono">
                    {am.sancionFechas ? `${am.sancionFechas} fechas` : '-'}
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && amonestados?.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No hay jugadores amonestados</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
