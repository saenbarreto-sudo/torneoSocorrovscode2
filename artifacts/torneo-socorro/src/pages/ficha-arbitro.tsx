import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useGetFichaArbitro } from '@workspace/api-client-react';
import { useAuth, canWrite } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ArrowLeft, Edit2, BadgeCheck, Swords, Wallet, CalendarClock } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { ArbitroFormDialog } from '@/components/arbitro-form-dialog';

function formatFecha(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  const [y, m, d] = fecha.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

/** Etiqueta + valor, el bloque que se repite en "Datos". */
function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className="text-sm font-semibold">{children}</div>
    </div>
  );
}

export default function FichaArbitro() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { role } = useAuth();
  const puedeEditar = canWrite(role, 'arbitros');
  const arbitroId = Number(id);

  const { data: ficha, isLoading } = useGetFichaArbitro(arbitroId);
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground">Cargando...</div>;
  }
  if (!ficha) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Árbitro no encontrado.
        <div className="mt-4"><Button variant="outline" onClick={() => navigate('/arbitros')}>Volver</Button></div>
      </div>
    );
  }

  const { arbitro, resumen, porEquipo, porFase, partidosPorFecha, historial, proximos } = ficha;

  const datosTarjetas = [
    { tipo: 'Amarillas', cantidad: resumen.amarillas, fill: '#f59e0b' },
    { tipo: 'Rojas', cantidad: resumen.rojas, fill: '#ef4444' },
  ].filter((d) => d.cantidad > 0);
  const configTarjetas: ChartConfig = { Amarillas: { label: 'Amarillas', color: '#f59e0b' }, Rojas: { label: 'Rojas', color: '#ef4444' } };
  const configCarga: ChartConfig = { partidos: { label: 'Partidos', color: '#3b82f6' } };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-start gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/arbitros')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Ficha de Árbitro</h1>
            <p className="text-muted-foreground mt-1">Historial y estadísticas</p>
          </div>
        </div>
        {puedeEditar && (
          <Button variant="outline" onClick={() => setEditOpen(true)} className="shrink-0">
            <Edit2 className="h-4 w-4 mr-2" /> Editar
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-6 sm:p-8 space-y-6">
          <div className="flex gap-4 items-start flex-wrap">
            <div className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 overflow-hidden">
              {arbitro.foto ? (
                <img src={arbitro.foto} alt={arbitro.nombre} className="w-full h-full object-cover" />
              ) : (
                <BadgeCheck className="h-9 w-9" />
              )}
            </div>
            <div className="flex-1 min-w-[220px]">
              <h2 className="text-2xl font-extrabold tracking-tight">{arbitro.nombre}</h2>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant={arbitro.activo ? 'success' : 'secondary'}>{arbitro.activo ? 'Activo' : 'Inactivo'}</Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
            <Dato label="Teléfono">{arbitro.telefono || '—'}</Dato>
            <Dato label="Registrado desde">{formatFecha(arbitro.createdAt)}</Dato>
            {arbitro.notas && <Dato label="Notas">{arbitro.notas}</Dato>}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-lg"><Swords className="h-5 w-5" /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Partidos</p>
              <p className="font-mono font-bold text-lg">{resumen.partidosDirigidos}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Amarillas</p>
            <p className="font-mono font-bold text-lg text-amber-600 dark:text-amber-400">{resumen.amarillas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Rojas</p>
            <p className="font-mono font-bold text-lg text-destructive">{resumen.rojas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-lg"><Wallet className="h-5 w-5" /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pagado</p>
              <p className="font-mono font-bold text-lg">{formatMoney(resumen.totalPagado)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {resumen.partidosDirigidos > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="font-bold text-sm mb-1">Carga de partidos en el tiempo</h3>
              <p className="text-xs text-muted-foreground mb-3">Cuántos partidos dirigió cada fecha</p>
              {partidosPorFecha.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Sin fechas registradas.</p>
              ) : (
                <ChartContainer config={configCarga} className="max-h-64 w-full">
                  <BarChart data={partidosPorFecha.map((d) => ({ ...d, fechaCorta: formatFecha(d.fecha) }))}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="fechaCorta" fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} width={28} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="partidos" fill="var(--color-partidos)" radius={4} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h3 className="font-bold text-sm mb-1">Tarjetas en sus partidos</h3>
              <p className="text-xs text-muted-foreground mb-3">Amarillas y rojas mostradas en los partidos que dirigió</p>
              {datosTarjetas.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Sin tarjetas registradas.</p>
              ) : (
                <>
                  <ChartContainer config={configTarjetas} className="mx-auto max-h-64">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent nameKey="tipo" hideLabel />} />
                      <Pie data={datosTarjetas} dataKey="cantidad" nameKey="tipo" innerRadius={45} outerRadius={80} strokeWidth={2}>
                        {datosTarjetas.map((d) => <Cell key={d.tipo} fill={d.fill} />)}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="flex justify-center gap-4 mt-2">
                    {datosTarjetas.map((d) => (
                      <span key={d.tipo} className="flex items-center gap-1.5 text-xs">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.fill }} />
                        {d.tipo} · {d.cantidad}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {proximos.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-6 py-4 border-b flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-bold">Próximos partidos asignados</h2>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead>Partido</TableHead>
                    <TableHead>Fase</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proximos.map((p) => (
                    <TableRow key={p.partidoId}>
                      <TableCell className="font-mono">{formatFecha(p.fecha)}</TableCell>
                      <TableCell className="font-mono">{p.hora || '—'}</TableCell>
                      <TableCell className="font-semibold">{p.localNombre} vs {p.visitanteNombre}</TableCell>
                      <TableCell>{p.fase || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {porEquipo.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-bold">Partidos por equipo</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Cuántas veces ha dirigido a cada uno (local o visitante)</p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipo</TableHead>
                    <TableHead className="text-center">Partidos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {porEquipo.map((e) => (
                    <TableRow key={e.equipoNombre}>
                      <TableCell className="font-semibold">{e.equipoNombre}</TableCell>
                      <TableCell className="text-center font-mono tabular-nums">{e.partidos}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-bold">Historial de partidos</h2>
            {porFase.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {porFase.map((f) => `${f.fase}: ${f.partidos}`).join(' · ')}
              </p>
            )}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Partido</TableHead>
                  <TableHead>Fase</TableHead>
                  <TableHead className="text-center">Resultado</TableHead>
                  <TableHead className="text-center">Amar.</TableHead>
                  <TableHead className="text-center">Rojas</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historial.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Sin partidos dirigidos todavía</TableCell></TableRow>
                ) : (
                  historial.map((h) => (
                    <TableRow key={h.partidoId}>
                      <TableCell className="font-mono whitespace-nowrap">{formatFecha(h.fecha)}</TableCell>
                      <TableCell className="font-semibold">{h.localNombre} vs {h.visitanteNombre}</TableCell>
                      <TableCell>{h.fase || '—'}</TableCell>
                      <TableCell className="text-center font-mono tabular-nums">
                        {h.golesLocal ?? '—'} - {h.golesVisitante ?? '—'}
                      </TableCell>
                      <TableCell className="text-center font-mono tabular-nums">{h.amarillas || '—'}</TableCell>
                      <TableCell className="text-center font-mono tabular-nums">{h.rojas || '—'}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{h.pagado != null ? formatMoney(h.pagado) : '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ArbitroFormDialog open={editOpen} onOpenChange={setEditOpen} arbitro={arbitro} />
    </div>
  );
}
