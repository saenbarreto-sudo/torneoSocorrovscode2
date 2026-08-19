import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customFetch, useGetEquipos } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Edit2, Trash2, UserCog } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { ROLE_LABELS, useAuth, type Role } from '@/lib/auth';

interface Usuario {
  id: number;
  username: string;
  nombre: string;
  rol: Exclude<Role, 'publico'>;
  equipoId: number | null;
  activo: boolean;
  createdAt: string;
}

const ROLES_ASIGNABLES: Exclude<Role, 'publico'>[] = ['admin', 'tesorero', 'mesa', 'delegado', 'carnets'];

const usuariosQueryKey = ['usuarios'];

function useUsuarios() {
  return useQuery({
    queryKey: usuariosQueryKey,
    queryFn: () => customFetch<Usuario[]>('/api/usuarios', { method: 'GET' }),
  });
}

const usuarioSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  username: z
    .string()
    .min(3, 'Mínimo 3 caracteres')
    .regex(/^[a-z0-9._-]+$/i, 'Solo letras, números, punto, guion y guion bajo'),
  password: z.string().optional(),
  rol: z.enum(['admin', 'tesorero', 'mesa', 'delegado', 'carnets']),
  equipoId: z.string().optional(),
  activo: z.boolean().default(true),
});

type UsuarioFormValues = z.infer<typeof usuarioSchema>;

export default function Usuarios() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { data: usuarios, isLoading } = useUsuarios();
  const { data: equipos } = useGetEquipos();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const form = useForm<UsuarioFormValues>({
    resolver: zodResolver(usuarioSchema),
    defaultValues: { nombre: '', username: '', password: '', rol: 'delegado', equipoId: '', activo: true },
  });

  const rolSeleccionado = form.watch('rol');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: usuariosQueryKey });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      customFetch<Usuario>('/api/usuarios', { method: 'POST', body: JSON.stringify(data) }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      customFetch<Usuario>(`/api/usuarios/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch<null>(`/api/usuarios/${id}`, { method: 'DELETE' }),
  });

  const openNew = () => {
    setEditingId(null);
    form.reset({ nombre: '', username: '', password: '', rol: 'delegado', equipoId: '', activo: true });
    setOpen(true);
  };

  const openEdit = (u: Usuario) => {
    setEditingId(u.id);
    form.reset({
      nombre: u.nombre,
      username: u.username,
      password: '',
      rol: u.rol,
      equipoId: u.equipoId ? u.equipoId.toString() : '',
      activo: u.activo,
    });
    setOpen(true);
  };

  const onSubmit = (values: UsuarioFormValues) => {
    if (!editingId && (!values.password || values.password.length < 4)) {
      form.setError('password', { message: 'La contraseña debe tener al menos 4 caracteres' });
      return;
    }

    const payload: Record<string, unknown> = {
      nombre: values.nombre,
      username: values.username,
      rol: values.rol,
      equipoId: values.rol === 'delegado' && values.equipoId ? Number(values.equipoId) : null,
      activo: values.activo,
    };
    if (values.password) payload.password = values.password;

    const onSuccess = () => {
      invalidate();
      toast({ title: editingId ? 'Usuario actualizado' : 'Usuario creado exitosamente' });
      setOpen(false);
    };
    const onError = (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Ocurrió un error';
      toast({ title: 'No se pudo guardar', description: message, variant: 'destructive' });
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload }, { onSuccess, onError });
    } else {
      createMutation.mutate(payload, { onSuccess, onError });
    }
  };

  const handleDelete = (u: Usuario) => {
    if (u.id === currentUser?.id) {
      toast({ title: 'No puedes eliminar tu propio usuario', variant: 'destructive' });
      return;
    }
    if (confirm(`¿Eliminar al usuario "${u.nombre}"? Esta acción no se puede deshacer.`)) {
      deleteMutation.mutate(u.id, {
        onSuccess: () => {
          invalidate();
          toast({ title: 'Usuario eliminado' });
        },
      });
    }
  };

  const nombreEquipo = (id: number | null) => equipos?.find((e) => e.id === id)?.nombre ?? '—';

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-100 text-primary rounded-lg">
            <UserCog className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Usuarios</h1>
            <p className="text-muted-foreground mt-1">Cuentas de acceso y asignación de roles</p>
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Usuario
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar Usuario' : 'Nuevo Usuario'}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="nombre"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre completo</FormLabel>
                      <FormControl><Input placeholder="Ej: Olga Barreto" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Usuario</FormLabel>
                        <FormControl><Input placeholder="Ej: olga.barreto" autoCapitalize="none" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{editingId ? 'Nueva contraseña (opcional)' : 'Contraseña'}</FormLabel>
                        <FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="rol"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rol</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ROLES_ASIGNABLES.map((r) => (
                            <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {rolSeleccionado === 'delegado' && (
                  <FormField
                    control={form.control}
                    name="equipoId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Equipo que representa</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Selecciona un equipo" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {equipos?.map((eq) => (
                              <SelectItem key={eq.id} value={eq.id.toString()}>{eq.nombre}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="activo"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <FormLabel className="!mt-0">Cuenta activa</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingId ? 'Guardar cambios' : 'Crear usuario'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cuentas registradas</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Cargando...</TableCell></TableRow>
              )}
              {!isLoading && usuarios?.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Aún no hay usuarios registrados</TableCell></TableRow>
              )}
              {usuarios?.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.nombre}</TableCell>
                  <TableCell className="font-mono text-sm">{u.username}</TableCell>
                  <TableCell><Badge variant="secondary">{ROLE_LABELS[u.rol]}</Badge></TableCell>
                  <TableCell>{u.rol === 'delegado' ? nombreEquipo(u.equipoId) : '—'}</TableCell>
                  <TableCell>
                    {u.activo ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Activo</Badge>
                    ) : (
                      <Badge variant="outline">Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(u)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
