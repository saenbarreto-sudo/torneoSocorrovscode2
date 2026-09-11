import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetArbitros,
  useGetEstadisticasArbitros,
  useBorrarArbitro,
  getGetArbitrosQueryKey,
  getGetEstadisticasArbitrosQueryKey,
  type Arbitro,
  type ArbitroComparativaLinea,
} from '@workspace/api-client-react';
import { useAuth, canWrite } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { extractErrorMessage } from '@/lib/api-errors';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Plus, Edit2, Trash2, Search, BadgeCheck, Swords, Wallet } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { ArbitroFormDialog } from '@/components/arbitro-form-dialog';

const PALETA = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

const NORMALIZAR = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Pestana = 'roster' | 'estadisticas';

export default function Arbitros({ embebido }: { embebido?: boolean } = {}) {
  const [, navigate] = useLocation();
  const { role } = useAuth();
  const puedeEscribir = canWrite(role, 'arbitros');

  const [pestana, setPestana] = useState<Pestana>('roster');
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'all' | 'true' | 'false'>('all');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Arbitro | null>(null);

  const { data: arbitrosRaw, isLoading } = useGetArbitros(
    filtroEstado === 'all' ? undefined : { activo: filtroEstado === 'true' },
  );
  const { data: comparativa } = useGetEstadisticasArbitros();

  const arbitros = useMemo(() => {
    if (!arbitrosRaw) return undefined;
    if (!search) return arbitrosRaw;
    return arbitrosRaw.filter((a) => NORMALIZAR(a.nombre).includes(NORMALIZAR(search.trim())));
  }, [arbitrosRaw, search]);

  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (a: Arbitro, e: React.MouseEvent) => { e.stopPropagation(); setEditing(a); setOpen(true); };

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const borrar = useBorrarArbitro();

  /**
   * Borrar solo sirve para deshacer un alta equivocada: si el árbitro ya
   * dirigió partidos el servidor lo rechaza y sugiere desactivarlo, para no
   * dejar esos partidos sin saber quién los dirigió.
   */
  async function onBorrar(a: Arbitro) {
    try {
      await borrar.mutateAsync({ id: a.id });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetArbitrosQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetEstadisticasArbitrosQueryKey() }),
      ]);
      toast({ title: `Se borró a ${a.nombre}` });
    } catch (err) {
      toast({ title: 'No se pudo borrar', description: extractErrorMessage(err), variant: 'destructive' });
    }
  }

  // ── Datos para los gráficos de la pestaña Estadísticas ──
  const lineas: ArbitroComparativaLinea[] = comparativa?.arbitros ?? [];
  const conPartidos = lineas.filter((l) => l.partidosDirigidos > 0);
  const datosReparto = conPartidos.map((l, i) => ({
    nombre: l.arbitroNombre,
    partidos: l.partidosDirigidos,
    fill: PALETA[i % PALETA.length],
  }));
  const datosPagado = [...conPartidos]
    .sort((a, b) => b.totalPagado - a.totalPagado)
    .map((l, i) => ({ nombre: l.arbitroNombre, pagado: l.totalPagado, fill: PALETA[i % PALETA.length] }));

  const configReparto: ChartConfig = Object.fromEntries(
    datosReparto.map((d) => [d.nombre, { label: d.nombre, color: d.fill }]),
  );
  const configPagado: ChartConfig = { pagado: { label: 'Pagado' } };

  return (
    <div className={embebido ? 'space-y-6' : 'space-y-6 animate-in fade-in duration-500'}>
      {!embebido && (
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 text-primary rounded-lg">
            <BadgeCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Árbitros</h1>
            <p className="text-muted-foreground mt-1">Quién dirige cada partido, y sus estadísticas</p>
          </div>
        </div>
      )}

      <Tabs value={pestana} onValueChange={(v) => setPestana(v as Pestana)}>
        <TabsList>
          <TabsTrigger value="roster">Árbitros</TabsTrigger>
          <TabsTrigger value="estadisticas">Estadísticas</TabsTrigger>
        </TabsList>
      </Tabs>

      {pestana === 'roster' && (
        <>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar árbitro..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={filtroEstado} onValueChange={(v) => setFiltroEstado(v as typeof filtroEstado)}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="true">Activos</SelectItem>
                <SelectItem value="false">Inactivos</SelectItem>
              </SelectContent>
            </Select>
            {puedeEscribir && (
              <Button onClick={openNew} className="shrink-0 sm:ml-auto">
                <Plus className="h-4 w-4 mr-2" /> Nuevo árbitro
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Árbitro</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead className="text-center">Partidos dirigidos</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    {puedeEscribir && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6">Cargando...</TableCell></TableRow>
                  ) : arbitros?.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Ningún árbitro coincide con la búsqueda.</TableCell></TableRow>
                  ) : (
                    arbitros?.map((a) => (
                      <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate(`/arbitros/${a.id}`)}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center text-muted-foreground">
                              {a.foto ? (
                                <img src={a.foto} alt={a.nombre} className="w-full h-full object-cover" />
                              ) : (
                                <BadgeCheck className="h-4 w-4" />
                              )}
                            </div>
                            <span className="font-bold">{a.nombre}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{a.telefono || '—'}</TableCell>
                        <TableCell className="text-center font-mono tabular-nums">{a.partidosDirigidos ?? 0}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={a.activo ? 'success' : 'secondary'}>{a.activo ? 'Activo' : 'Inactivo'}</Badge>
                        </TableCell>
                        {puedeEscribir && (
                          <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" onClick={(e) => openEdit(a, e)} aria-label={`Editar a ${a.nombre}`}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label={`Borrar a ${a.nombre}`}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>¿Borrar a {a.nombre}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {(a.partidosDirigidos ?? 0) > 0 ? (
                                      <>
                                        Ya tiene <span className="font-semibold">{a.partidosDirigidos} partido(s) dirigidos</span>, así
                                        que no se va a poder borrar — esos partidos quedarían sin saber quién los dirigió. Si ya no
                                        arbitra, edítalo y desmarca "Sigue arbitrando": desaparece de la lista para asignar, pero se
                                        conserva todo su historial.
                                      </>
                                    ) : (
                                      <>
                                        Se borra de la lista de árbitros. Esto sirve para deshacer un alta equivocada o un nombre
                                        repetido; no se puede deshacer.
                                      </>
                                    )}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => onBorrar(a)}>Borrar</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {pestana === 'estadisticas' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-primary/10 text-primary rounded-lg"><Swords className="h-5 w-5" /></div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Partidos dirigidos</p>
                  <p className="font-mono font-bold text-lg">{comparativa?.totalPartidos ?? 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-primary/10 text-primary rounded-lg"><Wallet className="h-5 w-5" /></div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pagado en arbitraje</p>
                  <p className="font-mono font-bold text-lg">{formatMoney(comparativa?.totalPagado ?? 0)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {conPartidos.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">Todavía no hay partidos dirigidos para mostrar estadísticas.</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-bold text-sm mb-1">Reparto de partidos entre árbitros</h3>
                  <p className="text-xs text-muted-foreground mb-3">Quién ha llevado más carga de partidos</p>
                  <ChartContainer config={configReparto} className="mx-auto max-h-72">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent nameKey="nombre" hideLabel />} />
                      <Pie data={datosReparto} dataKey="partidos" nameKey="nombre" innerRadius={50} outerRadius={90} strokeWidth={2}>
                        {datosReparto.map((d) => <Cell key={d.nombre} fill={d.fill} />)}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 justify-center">
                    {datosReparto.map((d) => (
                      <span key={d.nombre} className="flex items-center gap-1.5 text-xs">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.fill }} />
                        {d.nombre} · {d.partidos}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <h3 className="font-bold text-sm mb-1">Lo pagado por árbitro</h3>
                  <p className="text-xs text-muted-foreground mb-3">Total histórico de arbitraje pagado a cada uno</p>
                  <ChartContainer config={configPagado} className="max-h-72 w-full">
                    <BarChart data={datosPagado} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => formatMoney(v)} fontSize={11} />
                      <YAxis type="category" dataKey="nombre" width={110} fontSize={11} />
                      <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatMoney(Number(v))} />} />
                      <Bar dataKey="pagado" radius={4}>
                        {datosPagado.map((d) => <Cell key={d.nombre} fill={d.fill} />)}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Árbitro</TableHead>
                    <TableHead className="text-center">Partidos</TableHead>
                    <TableHead className="text-center">Amarillas</TableHead>
                    <TableHead className="text-center">Rojas</TableHead>
                    <TableHead className="text-right">Pagado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineas.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Sin datos todavía</TableCell></TableRow>
                  ) : (
                    [...lineas]
                      .sort((a, b) => b.partidosDirigidos - a.partidosDirigidos)
                      .map((l) => (
                        <TableRow key={l.arbitroId} className="cursor-pointer" onClick={() => navigate(`/arbitros/${l.arbitroId}`)}>
                          <TableCell className="font-bold">
                            {l.arbitroNombre}{!l.activo && <span className="text-muted-foreground font-normal"> (inactivo)</span>}
                          </TableCell>
                          <TableCell className="text-center font-mono tabular-nums">{l.partidosDirigidos}</TableCell>
                          <TableCell className="text-center font-mono tabular-nums">{l.amarillas}</TableCell>
                          <TableCell className="text-center font-mono tabular-nums">{l.rojas}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{formatMoney(l.totalPagado)}</TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      <ArbitroFormDialog open={open} onOpenChange={setOpen} arbitro={editing} />
    </div>
  );
}
