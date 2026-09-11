import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  customFetch,
  useGetEventos,
  type Evento,
  type GetEventosAccion,
} from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LogIn, ShieldAlert, Plus, Pencil, Trash2, History } from 'lucide-react';

/**
 * El registro de actividad: quién entró, quién creó, editó o borró algo, y
 * qué cambió exactamente.
 *
 * Las líneas las escribe solo el servidor (ver lib/registro-eventos.ts en
 * api-server); acá solo se leen y se agrupan por día, que es como uno
 * realmente busca ("¿qué pasó el sábado?").
 */

const TODOS = 'todos';

/** Las cuentas, con la misma clave que usa la pestaña de Usuarios: así se comparte la caché. */
function useUsuarios() {
  return useQuery({
    queryKey: ['usuarios'],
    queryFn: () =>
      customFetch<Array<{ id: number; nombre: string }>>('/api/usuarios', { method: 'GET' }),
  });
}

const ACCIONES: Array<{ valor: string; etiqueta: string }> = [
  { valor: TODOS, etiqueta: 'Todo' },
  { valor: 'crear', etiqueta: 'Creaciones' },
  { valor: 'editar', etiqueta: 'Ediciones' },
  { valor: 'borrar', etiqueta: 'Borrados' },
  { valor: 'ingreso', etiqueta: 'Entradas' },
  { valor: 'ingreso_fallido', etiqueta: 'Entradas fallidas' },
];

function IconoAccion({ accion }: { accion: string }) {
  const comun = 'h-4 w-4 shrink-0';
  if (accion === 'crear') return <Plus className={`${comun} text-emerald-600`} />;
  if (accion === 'editar') return <Pencil className={`${comun} text-amber-600`} />;
  if (accion === 'borrar') return <Trash2 className={`${comun} text-destructive`} />;
  if (accion === 'ingreso_fallido') return <ShieldAlert className={`${comun} text-destructive`} />;
  return <LogIn className={`${comun} text-muted-foreground`} />;
}

/** "Hoy", "Ayer" o la fecha, para encabezar cada grupo del listado. */
function tituloDelDia(iso: string): string {
  const fecha = new Date(iso);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  const mismoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (mismoDia(fecha, hoy)) return 'Hoy';
  if (mismoDia(fecha, ayer)) return 'Ayer';
  return fecha.toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

export default function Actividad({ embebido }: { embebido?: boolean } = {}) {
  const [usuarioId, setUsuarioId] = useState<string>(TODOS);
  const [accion, setAccion] = useState<GetEventosAccion | typeof TODOS>(TODOS);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const { data: usuarios } = useUsuarios();
  const { data: eventos, isLoading } = useGetEventos({
    ...(usuarioId !== TODOS ? { usuarioId: Number(usuarioId) } : {}),
    ...(accion !== TODOS ? { accion } : {}),
    ...(desde ? { desde } : {}),
    ...(hasta ? { hasta } : {}),
  });

  // Agrupado por día: es como uno busca de verdad ("¿qué pasó el sábado?").
  const porDia = useMemo(() => {
    const grupos = new Map<string, Evento[]>();
    for (const e of eventos ?? []) {
      const clave = e.createdAt.slice(0, 10);
      const lista = grupos.get(clave) ?? [];
      lista.push(e);
      grupos.set(clave, lista);
    }
    return [...grupos.entries()];
  }, [eventos]);

  return (
    <div className="space-y-4">
      {!embebido && (
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 text-primary rounded-lg">
            <History className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Actividad</h1>
            <p className="text-muted-foreground mt-1">Quién hizo qué en el torneo</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Usuario</Label>
          <Select value={usuarioId} onValueChange={setUsuarioId}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              {(usuarios ?? []).map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>{u.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Acción</Label>
          <Select value={accion} onValueChange={(v) => setAccion(v as GetEventosAccion | typeof TODOS)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACCIONES.map((a) => (
                <SelectItem key={a.valor} value={a.valor}>{a.etiqueta}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="actividad-desde">Desde</Label>
          <Input id="actividad-desde" type="date" className="w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="actividad-hasta">Hasta</Label>
          <Input id="actividad-hasta" type="date" className="w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <p className="p-6 text-center text-sm text-muted-foreground">Cargando...</p>}

          {!isLoading && porDia.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Todavía no hay nada registrado con esos filtros.
            </p>
          )}

          {porDia.map(([dia, delDia]) => (
            <div key={dia}>
              <div className="sticky top-0 bg-muted/60 backdrop-blur px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground border-y">
                {tituloDelDia(delDia[0].createdAt)}
              </div>
              <ul className="divide-y">
                {delDia.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="font-mono text-xs text-muted-foreground w-12 shrink-0 pt-0.5">
                      {hora(e.createdAt)}
                    </span>
                    <IconoAccion accion={e.accion} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold text-sm">{e.usuarioNombre}</span>
                        <span className="text-sm">{e.descripcion}</span>
                        {e.accion === 'ingreso_fallido' && (
                          <Badge variant="destructive" className="text-[10px]">falló</Badge>
                        )}
                      </div>
                      {e.cambios.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {e.cambios.map((c, i) => (
                            <li key={i} className="text-xs text-muted-foreground">
                              <span className="font-medium">{c.campo}:</span>{' '}
                              <span className="line-through opacity-70">{c.antes}</span>
                              {' → '}
                              <span className="font-medium text-foreground">{c.despues}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Se registran las acciones que modifican datos y las entradas al sistema, nunca las consultas.
        Las contraseñas y las fotos jamás se guardan aquí.
      </p>
    </div>
  );
}
