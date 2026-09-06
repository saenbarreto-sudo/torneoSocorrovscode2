import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth, canWrite } from '@/lib/auth';
import { extractErrorMessage } from '@/lib/api-errors';
import { useGetJugadores, useDeleteJugador, getGetJugadoresQueryKey, useGetEquipos, type Jugador } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { JugadorFormDialog } from '@/components/jugador-form-dialog';

/**
 * Edad que cumple el jugador dentro del año del torneo (Art. 10.1).
 * El reglamento se fija en el año, no en la fecha exacta: si el jugador
 * cumple 40 en diciembre y el torneo arranca en enero de ese mismo año,
 * igual puede jugar.
 */
function edadEnElAno(fechaNacimiento: string): number {
  return new Date().getFullYear() - new Date(fechaNacimiento).getFullYear();
}

export default function Jugadores() {
  const [, navigate] = useLocation();
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

  const deleteMutation = useDeleteJugador();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Jugador | null>(null);

  const openEdit = (jugador: Jugador) => {
    setEditing(jugador);
    setOpen(true);
  };

  const openNew = () => {
    setEditing(null);
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
            <Button onClick={openNew} className="shrink-0">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Jugador
            </Button>
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
                <TableRow
                  key={jugador.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/jugadores/${jugador.id}`)}
                >
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
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
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

      <JugadorFormDialog
        open={open}
        onOpenChange={setOpen}
        jugador={editing}
        defaultEquipoId={filtroEquipo !== 'all' ? Number(filtroEquipo) : undefined}
      />
    </div>
  );
}
