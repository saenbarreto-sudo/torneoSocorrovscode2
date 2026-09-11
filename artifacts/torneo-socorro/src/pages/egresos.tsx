import { useState } from 'react';
import {
  useGetEgresos,
  useCreateEgreso,
  useDeleteEgreso,
  useUpdateEgreso,
  type Egreso,
} from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Wallet, Edit2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { useAuth, canWrite } from '@/lib/auth';
import { extractErrorMessage } from '@/lib/api-errors';
import { formatMoney } from '@/lib/utils';

const CATEGORIAS = ['Carnets', 'Uniformes', 'Balones', 'Arbitraje', 'Premiación', 'Otro'];

const egresoSchema = z.object({
  fecha: z.string().min(1, 'La fecha es requerida'),
  descripcion: z.string().min(1, 'La descripción es requerida'),
  categoria: z.string().optional(),
  valor: z.coerce.number().min(0, 'El valor debe ser mayor a 0'),
});

/** `embebido`: se muestra como pestaña dentro de Tesorería (ver pages/tesoreria.tsx). */
export default function Egresos({ embebido = false }: { embebido?: boolean }) {
  const { role } = useAuth();
  const readOnly = !canWrite(role, 'pagos');
  const { toast } = useToast();
  const [filtroCategoria, setFiltroCategoria] = useState<string>('all');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const { data: egresos, isLoading } = useGetEgresos({
    ...(filtroCategoria !== 'all' ? { categoria: filtroCategoria } : {}),
    ...(desde ? { desde } : {}),
    ...(hasta ? { hasta } : {}),
  });

  const totalFiltrado = (egresos ?? []).reduce((suma, e) => suma + e.valor, 0);
  const hayFiltro = filtroCategoria !== 'all' || !!desde || !!hasta;

  const createMutation = useCreateEgreso();
  const deleteMutation = useDeleteEgreso();
  const updateMutation = useUpdateEgreso();
  const [open, setOpen] = useState(false);

  // ── Corregir un gasto ya registrado ───────────────────────────────────────
  const [editando, setEditando] = useState<Egreso | null>(null);
  const [editDescripcion, setEditDescripcion] = useState('');
  const [editCategoria, setEditCategoria] = useState('');
  const [editValor, setEditValor] = useState('');
  const [editFecha, setEditFecha] = useState('');

  const abrirEdicion = (e: Egreso) => {
    setEditando(e);
    setEditDescripcion(e.descripcion);
    setEditCategoria(e.categoria ?? '');
    setEditValor(String(e.valor));
    setEditFecha(e.fecha);
  };

  const guardarEdicion = () => {
    if (!editando) return;
    const valor = Number(editValor.replace(/[^\d]/g, ''));
    if (!Number.isFinite(valor) || valor <= 0) {
      toast({ title: 'El valor debe ser mayor que cero', variant: 'destructive' });
      return;
    }
    if (!editDescripcion.trim()) {
      toast({ title: 'La descripción no puede quedar vacía', variant: 'destructive' });
      return;
    }
    updateMutation.mutate(
      {
        id: editando.id,
        data: {
          descripcion: editDescripcion.trim(),
          categoria: editCategoria || null,
          valor,
          fecha: editFecha,
        },
      },
      {
        onSuccess: () => {
          toast({ title: 'Egreso corregido', description: `Quedó en ${formatMoney(valor)}.` });
          setEditando(null);
        },
        onError: (err) =>
          toast({ title: 'No se pudo corregir', description: extractErrorMessage(err), variant: 'destructive' }),
      },
    );
  };

  const form = useForm<z.infer<typeof egresoSchema>>({
    resolver: zodResolver(egresoSchema),
    defaultValues: { fecha: new Date().toISOString().split('T')[0], descripcion: '', categoria: '', valor: 0 },
  });

  const onSubmit = (data: z.infer<typeof egresoSchema>) => {
    createMutation.mutate(
      { data },
      {
        onSuccess: () => {
          toast({ title: 'Egreso registrado' });
          setOpen(false);
          form.reset({ fecha: new Date().toISOString().split('T')[0], descripcion: '', categoria: '', valor: 0 });
        },
        onError: (err) => {
          toast({ title: 'No se pudo registrar', description: extractErrorMessage(err), variant: 'destructive' });
        },
      },
    );
  };

  const handleDelete = (id: number) => {
    if (confirm('¿Está seguro de eliminar este egreso?')) {
      deleteMutation.mutate(
        { id },
        {
          onSuccess: () => toast({ title: 'Egreso eliminado' }),
          onError: (err) => {
            toast({ title: 'No se pudo eliminar', description: extractErrorMessage(err), variant: 'destructive' });
          },
        },
      );
    }
  };

  const filtros = (
    <div className="flex flex-wrap gap-2">
      <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder="Todas las categorías" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las categorías</SelectItem>
          {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input type="date" className="w-full sm:w-40" aria-label="Desde" value={desde} onChange={(e) => setDesde(e.target.value)} />
      <Input type="date" className="w-full sm:w-40" aria-label="Hasta" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      {hayFiltro && (
        <Button variant="ghost" onClick={() => { setFiltroCategoria('all'); setDesde(''); setHasta(''); }}>
          Quitar filtros
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Corregir un gasto ya registrado, sin tener que borrarlo y rehacerlo. */}
      <Dialog open={editando != null} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Corregir el egreso</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="edit-egreso-desc" className="text-sm font-medium">Descripción</label>
              <Input id="edit-egreso-desc" value={editDescripcion} onChange={(e) => setEditDescripcion(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-egreso-cat" className="text-sm font-medium">Categoría</label>
              <Select value={editCategoria} onValueChange={setEditCategoria}>
                <SelectTrigger id="edit-egreso-cat"><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-egreso-valor" className="text-sm font-medium">Valor</label>
              <Input id="edit-egreso-valor" inputMode="numeric" value={editValor} onChange={(e) => setEditValor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-egreso-fecha" className="text-sm font-medium">Fecha</label>
              <Input id="edit-egreso-fecha" type="date" value={editFecha} onChange={(e) => setEditFecha(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={guardarEdicion} disabled={updateMutation.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        {!embebido && (
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 text-primary rounded-lg">
              <Wallet className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Egresos</h1>
              <p className="text-muted-foreground mt-1">Gastos de la organización del torneo</p>
            </div>
          </div>
        )}

        {!readOnly && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Egreso
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Registrar Egreso</DialogTitle></DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="fecha" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="descripcion" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripción</FormLabel>
                      <FormControl><Input placeholder="Ej: Compra de láminas PVC" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="categoria" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoría (opcional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="valor" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor</FormLabel>
                      <FormControl><Input type="number" min={0} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <DialogFooter className="pt-4">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button type="submit" disabled={createMutation.isPending}>Guardar</Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {filtros}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                {!readOnly && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-6">Cargando...</TableCell></TableRow>
              ) : egresos?.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono">{e.fecha}</TableCell>
                  <TableCell className="font-medium">{e.descripcion}</TableCell>
                  <TableCell className="text-muted-foreground">{e.categoria || '-'}</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(e.valor)}</TableCell>
                  {!readOnly && (
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" onClick={() => abrirEdicion(e)} title="Corregir este egreso">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(e.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!isLoading && egresos?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                    {hayFiltro ? 'Ningún egreso coincide con el filtro' : 'No hay egresos registrados'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {egresos && egresos.length > 0 && (
              <tfoot>
                <TableRow className="bg-muted/40">
                  <TableCell colSpan={3} className="text-right font-bold">
                    {hayFiltro ? 'Total de lo filtrado' : 'Total'}
                    <span className="ml-2 font-normal text-muted-foreground">
                      ({egresos.length} {egresos.length === 1 ? 'egreso' : 'egresos'})
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">{formatMoney(totalFiltrado)}</TableCell>
                  {!readOnly && <TableCell />}
                </TableRow>
              </tfoot>
            )}
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
