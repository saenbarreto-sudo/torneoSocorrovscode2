import { useMemo, useState } from 'react';
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
import { Plus, Edit2, Trash2, Search, ArrowUp, ArrowDown, ChevronsUpDown, X } from 'lucide-react';
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

/** Columnas por las que se puede ordenar y filtrar. */
type Columna = 'nCarnet' | 'nombre' | 'cedula' | 'edad' | 'pj' | 'estado' | 'equipo';

type Direccion = 'asc' | 'desc';

/** Texto con el que se compara y se filtra cada columna de una fila. */
function valorDe(jugador: Jugador, columna: Columna): string | number | null {
  switch (columna) {
    case 'nCarnet':
      return jugador.nCarnet ?? null;
    case 'nombre':
      return jugador.nombre;
    case 'cedula':
      return jugador.cedula ?? null;
    case 'edad':
      return jugador.fechaNacimiento ? edadEnElAno(jugador.fechaNacimiento) : null;
    case 'pj':
      return jugador.partidosJugados ?? 0;
    case 'estado':
      return (jugador.partidosJugados ?? 0) > 0 ? 'Activo' : 'Inactivo';
    case 'equipo':
      return jugador.equipoNombre;
  }
}

const NORMALIZAR = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** true si el valor de la celda contiene lo que se escribió en el filtro. */
function coincide(valor: string | number | null, texto: string): boolean {
  if (!texto) return true;
  if (valor == null) return false;
  return NORMALIZAR(String(valor)).includes(NORMALIZAR(texto.trim()));
}

/**
 * Encabezado que ordena al hacer clic, con la flecha del orden actual.
 *
 * Va fuera del componente de la página a propósito: si se define adentro,
 * React lo trata como un tipo distinto en cada render, desmonta la fila de
 * filtros y el campo de texto pierde el foco a cada tecla.
 */
function Encabezado({
  columna,
  children,
  className = '',
  orden,
  onOrdenar,
}: {
  columna: Columna;
  children: string;
  className?: string;
  orden: { columna: Columna; direccion: Direccion };
  onOrdenar: (columna: Columna) => void;
}) {
  const activa = orden.columna === columna;
  const Icono = !activa ? ChevronsUpDown : orden.direccion === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onOrdenar(columna)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${activa ? 'text-foreground font-bold' : ''}`}
        title={`Ordenar por ${children}`}
      >
        {children}
        <Icono className={`h-3.5 w-3.5 ${activa ? '' : 'opacity-40'}`} />
      </button>
    </TableHead>
  );
}

/** Casilla de filtro de una columna. Fuera del componente por lo mismo. */
function FiltroTexto({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (texto: string) => void;
  placeholder: string;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-8 text-xs font-normal"
    />
  );
}

export default function Jugadores() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { role } = useAuth();
  const readOnly = !canWrite(role, 'jugadores');

  // El equipo se filtra en el servidor (es el único que reduce la consulta);
  // el resto de columnas se filtran aquí, sobre lo que ya está cargado.
  const [filtroEquipo, setFiltroEquipo] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [filtros, setFiltros] = useState<Partial<Record<Columna, string>>>({});
  const [filtroEstado, setFiltroEstado] = useState<string>('all');

  // Arranca por número de carné, que es como se lleva la base del torneo.
  const [orden, setOrden] = useState<{ columna: Columna; direccion: Direccion }>({
    columna: 'nCarnet',
    direccion: 'asc',
  });

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

  const alternarOrden = (columna: Columna) => {
    setOrden((previo) =>
      previo.columna === columna
        ? { columna, direccion: previo.direccion === 'asc' ? 'desc' : 'asc' }
        : { columna, direccion: 'asc' },
    );
  };

  const ponerFiltro = (columna: Columna, texto: string) =>
    setFiltros((previo) => ({ ...previo, [columna]: texto }));

  const limpiarFiltros = () => {
    setFiltros({});
    setFiltroEstado('all');
    setSearch('');
  };

  const hayFiltros =
    search !== '' || filtroEstado !== 'all' || Object.values(filtros).some((v) => v);

  const jugadores = useMemo(() => {
    if (!jugadoresRaw) return undefined;

    const filtrados = jugadoresRaw.filter((j) => {
      // Buscador general: mira nombre, cédula, carné y equipo a la vez.
      if (search) {
        const enAlguna = (['nombre', 'cedula', 'nCarnet', 'equipo'] as Columna[]).some((c) =>
          coincide(valorDe(j, c), search),
        );
        if (!enAlguna) return false;
      }
      if (filtroEstado !== 'all' && valorDe(j, 'estado') !== filtroEstado) return false;
      for (const columna of Object.keys(filtros) as Columna[]) {
        if (!coincide(valorDe(j, columna), filtros[columna] ?? '')) return false;
      }
      return true;
    });

    const factor = orden.direccion === 'asc' ? 1 : -1;
    return [...filtrados].sort((a, b) => {
      const va = valorDe(a, orden.columna);
      const vb = valorDe(b, orden.columna);
      // Los vacíos siempre al final, se ordene como se ordene: un jugador sin
      // carné no debe encabezar la lista solo por invertir el orden.
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
      return String(va).localeCompare(String(vb), 'es', { numeric: true }) * factor;
    });
  }, [jugadoresRaw, search, filtros, filtroEstado, orden]);

  const total = jugadoresRaw?.length ?? 0;
  const mostrados = jugadores?.length ?? 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Jugadores</h1>
          <p className="text-muted-foreground mt-1">
            {isLoading
              ? 'Base de datos de jugadores'
              : mostrados === total
                ? `${total.toLocaleString('es-CO')} jugadores`
                : `${mostrados.toLocaleString('es-CO')} de ${total.toLocaleString('es-CO')} jugadores`}
          </p>
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

          {hayFiltros && (
            <Button variant="outline" onClick={limpiarFiltros} className="shrink-0">
              <X className="h-4 w-4 mr-2" /> Limpiar filtros
            </Button>
          )}

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
                <Encabezado columna="nCarnet" orden={orden} onOrdenar={alternarOrden}>Carnet</Encabezado>
                <Encabezado columna="nombre" orden={orden} onOrdenar={alternarOrden}>Jugador</Encabezado>
                <Encabezado columna="cedula" orden={orden} onOrdenar={alternarOrden}>Cédula</Encabezado>
                <Encabezado columna="edad" className="text-center" orden={orden} onOrdenar={alternarOrden}>Edad</Encabezado>
                <Encabezado columna="pj" className="text-center" orden={orden} onOrdenar={alternarOrden}>PJ</Encabezado>
                <Encabezado columna="estado" className="text-center" orden={orden} onOrdenar={alternarOrden}>Estado</Encabezado>
                <Encabezado columna="equipo" orden={orden} onOrdenar={alternarOrden}>Equipo</Encabezado>
                {!readOnly && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>

              {/* Fila de filtros: uno por columna. */}
              <TableRow className="hover:bg-transparent">
                <TableHead className="py-2"><FiltroTexto value={filtros.nCarnet ?? ''} onChange={(v) => ponerFiltro('nCarnet', v)} placeholder="N.º" /></TableHead>
                <TableHead className="py-2"><FiltroTexto value={filtros.nombre ?? ''} onChange={(v) => ponerFiltro('nombre', v)} placeholder="Nombre" /></TableHead>
                <TableHead className="py-2"><FiltroTexto value={filtros.cedula ?? ''} onChange={(v) => ponerFiltro('cedula', v)} placeholder="Cédula" /></TableHead>
                <TableHead className="py-2"><FiltroTexto value={filtros.edad ?? ''} onChange={(v) => ponerFiltro('edad', v)} placeholder="Edad" /></TableHead>
                <TableHead className="py-2"><FiltroTexto value={filtros.pj ?? ''} onChange={(v) => ponerFiltro('pj', v)} placeholder="PJ" /></TableHead>
                <TableHead className="py-2">
                  <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="Activo">Activo</SelectItem>
                      <SelectItem value="Inactivo">Inactivo</SelectItem>
                    </SelectContent>
                  </Select>
                </TableHead>
                <TableHead className="py-2">
                  <Select value={filtroEquipo} onValueChange={setFiltroEquipo}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los equipos</SelectItem>
                      {equipos?.map(eq => (
                        <SelectItem key={eq.id} value={eq.id.toString()}>{eq.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableHead>
                {!readOnly && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={readOnly ? 7 : 8} className="text-center py-6">Cargando...</TableCell></TableRow>
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
                <TableRow>
                  <TableCell colSpan={readOnly ? 7 : 8} className="text-center py-6 text-muted-foreground">
                    Ningún jugador coincide con los filtros.
                    {hayFiltros && (
                      <Button variant="link" onClick={limpiarFiltros}>Limpiar filtros</Button>
                    )}
                  </TableCell>
                </TableRow>
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
