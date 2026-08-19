import { useState } from 'react';
import { useAuth, canWrite } from '@/lib/auth';
import { extractErrorMessage } from '@/lib/api-errors';
import { useGetJugadores, useCreateJugador, useUpdateJugador, useDeleteJugador, getGetJugadoresQueryKey, useGetEquipos } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

/**
 * Edad que cumple el jugador dentro del año del torneo (Art. 10.1).
 * El reglamento mira el año, no la fecha exacta: si cumple 40 en diciembre
 * y el torneo arranca en enero de ese mismo año, sí puede jugar.
 */
function edadEnElAno(fechaNacimiento: string): number {
  return new Date().getFullYear() - new Date(fechaNacimiento).getFullYear();
}

const EDAD_MINIMA = 40;

const jugadorSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  cedula: z.string().min(1, 'La cédula es obligatoria'),
  fechaNacimiento: z.string().optional(),
  equipoId: z.coerce.number().min(1, 'Seleccione un equipo'),
  nCarnet: z.coerce.number().optional(),
}).refine(
  (d) => !d.fechaNacimiento || edadEnElAno(d.fechaNacimiento) >= EDAD_MINIMA,
  {
    path: ['fechaNacimiento'],
    message: `El jugador debe cumplir al menos ${EDAD_MINIMA} años este año (Art. 10.1).`,
  },
);

type JugadorFormValues = z.infer<typeof jugadorSchema>;

export default function Jugadores() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { role } = useAuth();
  const readOnly = !canWrite(role, 'jugadores');
  
  const [filtroEquipo, setFiltroEquipo] = useState<string>('all');
  const [search, setSearch] = useState('');
  
  const { data: equipos } = useGetEquipos();
  const { data: jugadoresRaw, isLoading } = useGetJugadores(
    filtroEquipo !== 'all' ? { equipoId: Number(filtroEquipo) } : undefined
  );
  
  const createMutation = useCreateJugador();
  const updateMutation = useUpdateJugador();
  const deleteMutation = useDeleteJugador();
  
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const form = useForm<JugadorFormValues>({
    resolver: zodResolver(jugadorSchema),
    defaultValues: {
      nombre: '',
      cedula: '',
      fechaNacimiento: '',
      equipoId: 0,
      nCarnet: undefined
    }
  });

  const onSubmit = (data: JugadorFormValues) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetJugadoresQueryKey() });
          toast({ title: 'Jugador actualizado' });
          setOpen(false);
        }
      });
    } else {
      createMutation.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetJugadoresQueryKey() });
          toast({ title: 'Jugador creado' });
          setOpen(false);
        }
      });
    }
  };

  const openEdit = (jugador: any) => {
    setEditingId(jugador.id);
    form.reset({
      nombre: jugador.nombre,
      cedula: jugador.cedula || '',
      fechaNacimiento: jugador.fechaNacimiento ? jugador.fechaNacimiento.split('T')[0] : '',
      equipoId: jugador.equipoId,
      nCarnet: jugador.nCarnet || undefined
    });
    setOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    form.reset({
      nombre: '',
      cedula: '',
      fechaNacimiento: '',
      equipoId: filtroEquipo !== 'all' ? Number(filtroEquipo) : 0,
      nCarnet: undefined
    });
    setOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('¿Está seguro de eliminar este jugador?')) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetJugadoresQueryKey() });
          toast({ title: 'Jugador eliminado' });
        },
        onError: (err) => {
          toast({ title: 'No se pudo eliminar', description: extractErrorMessage(err), variant: 'destructive' });
        },
      });
    }
  };

  const jugadores = jugadoresRaw?.filter(j => j.nombre.toLowerCase().includes(search.toLowerCase()) || (j.cedula && j.cedula.includes(search)));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Jugadores</h1>
          <p className="text-muted-foreground mt-1">Base de datos de jugadores</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar jugador..." 
              className="pl-8" 
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
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
          
          {!readOnly && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="shrink-0">
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Jugador
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? 'Editar Jugador' : 'Nuevo Jugador'}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="nombre"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre Completo</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="cedula"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cédula</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nCarnet"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>N° Carnet</FormLabel>
                          <FormControl><Input type="number" {...field} value={field.value || ''} /></FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="equipoId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Equipo</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ? field.value.toString() : ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccione equipo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {equipos
                                ?.filter(eq => eq.activo || eq.id === field.value)
                                .map(eq => (
                                  <SelectItem key={eq.id} value={eq.id.toString()}>{eq.nombre}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="fechaNacimiento"
                      render={({ field }) => {
                        const edad = field.value ? edadEnElAno(field.value) : null;
                        return (
                          <FormItem>
                            <FormLabel>F. Nacimiento</FormLabel>
                            <FormControl><Input type="date" {...field} /></FormControl>
                            {edad != null && edad < 40 && (
                              <p className="text-xs text-destructive font-medium">
                                Cumple {edad} años este año. No se puede registrar: el mínimo es 40 (Art. 10.1).
                              </p>
                            )}
                          </FormItem>
                        );
                      }}
                    />
                  </div>
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
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Carnet</TableHead>
                <TableHead>Jugador</TableHead>
                <TableHead>Cédula</TableHead>
                <TableHead className="text-center">Edad</TableHead>
                <TableHead className="text-center">PJ</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead>Equipo</TableHead>
                {!readOnly && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-6">Cargando...</TableCell></TableRow>
              ) : jugadores?.map((jugador) => (
                <TableRow key={jugador.id}>
                  <TableCell className="font-mono text-muted-foreground">{jugador.nCarnet ? `#${jugador.nCarnet.toString().padStart(4, '0')}` : '-'}</TableCell>
                  <TableCell className="font-bold">{jugador.nombre}</TableCell>
                  <TableCell className="font-mono">{jugador.cedula || '-'}</TableCell>
                  <TableCell className="text-center font-mono tabular-nums">
                    {jugador.fechaNacimiento ? edadEnElAno(jugador.fechaNacimiento) : '-'}
                  </TableCell>
                  <TableCell className="text-center font-mono tabular-nums">{jugador.partidosJugados ?? 0}</TableCell>
                  <TableCell className="text-center">
                    {(jugador.partidosJugados ?? 0) > 0 ? (
                      <Badge variant="success">Activo</Badge>
                    ) : (
                      <Badge variant="secondary">Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">{jugador.equipoNombre}</Badge>
                  </TableCell>
                  {!readOnly && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(jugador)}><Edit2 className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(jugador.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                  )}
                </TableRow>
              ))}
              {!isLoading && jugadores?.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No hay jugadores encontrados</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
