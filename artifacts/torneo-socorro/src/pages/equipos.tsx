import { useState } from 'react';
import { useGetEquipos, useCreateEquipo, useUpdateEquipo, useDeleteEquipo, getGetEquiposQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { useAuth, canWrite } from '@/lib/auth';
import { extractErrorMessage } from '@/lib/api-errors';

const equipoSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  delegado: z.string().optional(),
  delegado2: z.string().optional(),
  telefono: z.string().min(1, 'El teléfono es obligatorio'),
  color: z.string().optional(),
  activo: z.boolean().default(true),
  puntosBonificacion: z.coerce.number().min(0).max(1).optional(),
  deudaInscripcion: z.coerce.number().min(0).optional(),
});

type EquipoFormValues = z.infer<typeof equipoSchema>;

export default function Equipos() {
  const { role } = useAuth();
  const readOnly = !canWrite(role, 'equipos');
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: equipos, isLoading } = useGetEquipos();
  
  const createMutation = useCreateEquipo();
  const updateMutation = useUpdateEquipo();
  const deleteMutation = useDeleteEquipo();
  
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const form = useForm<EquipoFormValues>({
    resolver: zodResolver(equipoSchema),
    defaultValues: {
      nombre: '',
      delegado: '',
      delegado2: '',
      telefono: '',
      color: '',
      activo: true,
      puntosBonificacion: 0,
      deudaInscripcion: 1000000
    }
  });

  const onSubmit = (data: EquipoFormValues) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetEquiposQueryKey() });
          toast({ title: 'Equipo actualizado' });
          setOpen(false);
        }
      });
    } else {
      createMutation.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetEquiposQueryKey() });
          toast({ title: 'Equipo creado' });
          setOpen(false);
        }
      });
    }
  };

  const openEdit = (equipo: any) => {
    setEditingId(equipo.id);
    form.reset({
      nombre: equipo.nombre,
      delegado: equipo.delegado || '',
      delegado2: equipo.delegado2 || '',
      telefono: equipo.telefono || '',
      color: equipo.color || '',
      activo: equipo.activo,
      puntosBonificacion: equipo.puntosBonificacion ?? 0,
      deudaInscripcion: equipo.deudaInscripcion ?? 1000000
    });
    setOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    form.reset({
      nombre: '',
      delegado: '',
      delegado2: '',
      telefono: '',
      color: '',
      activo: true,
      puntosBonificacion: 0,
      deudaInscripcion: 1000000
    });
    setOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('¿Está seguro de eliminar este equipo?')) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetEquiposQueryKey() });
          toast({ title: 'Equipo eliminado' });
        },
        onError: (err) => {
          toast({ title: 'No se pudo eliminar', description: extractErrorMessage(err), variant: 'destructive' });
        },
      });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Equipos</h1>
          <p className="text-muted-foreground mt-1">Gestión de equipos del torneo</p>
        </div>
        
        {!readOnly && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Equipo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar Equipo' : 'Nuevo Equipo'}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="nombre"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="delegado"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delegado principal</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="delegado2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delegado suplente</FormLabel>
                      <FormControl><Input placeholder="Respaldo del delegado principal" {...field} /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="telefono"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color Representativo</FormLabel>
                      <FormControl><Input type="color" className="h-10 p-1 w-full" {...field} /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="deudaInscripcion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor de inscripción (deuda de la temporada)</FormLabel>
                      <FormControl><Input type="number" min={0} {...field} /></FormControl>
                      <p className="text-xs text-muted-foreground">
                        Se usa en Estado de Cuenta para calcular cuánto le falta pagar al equipo.
                      </p>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="activo"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start gap-3 rounded-md border p-3">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Equipo activo</FormLabel>
                        <p className="text-xs text-muted-foreground">
                          Los equipos inactivos no aparecen en la tabla de posiciones ni se pueden
                          seleccionar al programar partidos. Úsalo para equipos retirados o excluidos.
                        </p>
                      </div>
                    </FormItem>
                  )}
                />
                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>Guardar</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Delegado</TableHead>
                <TableHead>Suplente</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead>Teléfono</TableHead>
                {!readOnly && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-6">Cargando...</TableCell></TableRow>
              ) : equipos?.map((equipo) => (
                <TableRow key={equipo.id}>
                  <TableCell>
                    {equipo.color && <div className="w-4 h-4 rounded-full border shadow-sm" style={{ backgroundColor: equipo.color }}></div>}
                  </TableCell>
                  <TableCell className="font-bold">{equipo.nombre}</TableCell>
                  <TableCell>{equipo.delegado || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{equipo.delegado2 || '-'}</TableCell>
                  <TableCell className="text-center">
                    {equipo.activo ? (
                      <Badge variant="success">Activo</Badge>
                    ) : (
                      <Badge variant="secondary">Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono">{equipo.telefono || '-'}</TableCell>
                  {!readOnly && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(equipo)}><Edit2 className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(equipo.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!isLoading && equipos?.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-6">No hay equipos registrados</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
