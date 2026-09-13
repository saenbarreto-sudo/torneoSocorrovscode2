import type { ElementType } from 'react';
import { useGetDashboardResumen, useGetPartidos, useGetPosiciones } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert, Users, Swords, Goal, HandCoins, CalendarDays, ArrowRight } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Link } from 'wouter';
import { useAuth, canAccessRoute } from '@/lib/auth';
import { NombreEquipo } from '@/components/nombre-equipo';

/** El ícono de cada cifra, con el color del tono que le corresponde. */
const TONOS = {
  neutro: 'bg-primary/10 text-primary',
  bueno: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  ojo: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
} as const;

/**
 * Tarjeta de cifra: el número grande con su ícono en color y, debajo, una
 * línea que dice qué significa — un "1.260" solo no dice si eso está bien o
 * mal, y esa línea es la que convierte el dato en información.
 *
 * El número usa `break-all` y un tamaño que cede en pantallas angostas: sin
 * eso, una cifra larga (1.260 jugadores, un recaudo de millones) se salía
 * de la tarjeta en el celular.
 */
function StatCard({
  label,
  value,
  suffix,
  detalle,
  tono = 'neutro',
  icon: Icon,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  detalle?: string;
  tono?: keyof typeof TONOS;
  icon: ElementType;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground leading-tight">{label}</p>
          <span className={`p-1.5 rounded-md shrink-0 ${TONOS[tono]}`}>
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-2 font-mono font-bold text-xl sm:text-2xl lg:text-3xl leading-none tabular-nums break-all">
          {value}
          {suffix && <span className="text-sm text-muted-foreground font-normal ml-1">{suffix}</span>}
        </p>
        {detalle && <p className="mt-1.5 text-xs text-muted-foreground leading-tight">{detalle}</p>}
      </CardContent>
    </Card>
  );
}

/** Estado vacío: dice qué falta y cómo resolverlo, no solo "sin datos". */
function EmptyState({ mensaje, accion, href }: { mensaje: string; accion?: string; href?: string }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-muted-foreground">{mensaje}</p>
      {accion && href && (
        <Link href={href} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          {accion} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { role } = useAuth();
  const { data: resumen, isLoading } = useGetDashboardResumen();
  const { data: partidos } = useGetPartidos();
  const { data: posiciones } = useGetPosiciones();

  const vePagos = canAccessRoute(role, '/pagos');

  if (isLoading || !resumen) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-56 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5 space-y-3">
                <div className="h-3 bg-muted rounded w-2/3 animate-pulse" />
                <div className="h-8 bg-muted rounded w-1/3 animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Más recientes primero: por fecha de calendario y, si empatan, por jornada.
  const recientes = (partidos ?? [])
    .filter((p) => p.jugado)
    .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '') || b.semana - a.semana)
    .slice(0, 6);

  const topPosiciones = posiciones?.slice(0, 5) ?? [];
  // Fair play: menor puntaje = mejor comportamiento (amarilla 10, roja 20).
  const masLimpio = [...(posiciones ?? [])]
    .filter((p) => p.pj > 0)
    .sort((a, b) => (a.puntajeFairplay ?? 0) - (b.puntajeFairplay ?? 0))[0];

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Resumen del torneo</h1>
          <p className="text-muted-foreground mt-1">Senior Master Plus 40 · Cartagena</p>
        </div>
        {resumen.proximaFecha && (
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider leading-none">Próxima fecha</p>
              <p className="font-mono font-bold text-primary leading-tight">{resumen.proximaFecha}</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Equipos" value={resumen.totalEquipos} detalle="compitiendo" icon={ShieldAlert} />
        <StatCard
          label="Jugadores"
          value={resumen.totalJugadores.toLocaleString('es-CO')}
          detalle="inscritos en el torneo"
          icon={Users}
        />
        <StatCard
          label="Partidos jugados"
          value={resumen.totalPartidosJugados}
          suffix={`/ ${resumen.totalPartidosProgramados}`}
          detalle={
            resumen.totalPartidosProgramados > 0
              ? `faltan ${resumen.totalPartidosProgramados - resumen.totalPartidosJugados} por jugar`
              : 'todavía sin calendario'
          }
          tono={resumen.totalPartidosJugados > 0 ? 'bueno' : 'neutro'}
          icon={Swords}
        />
        {vePagos ? (
          <StatCard
            label="Recaudo"
            value={formatMoney(resumen.recaudacionTotal || 0)}
            detalle="cobrado hasta hoy"
            tono={(resumen.recaudacionTotal || 0) > 0 ? 'bueno' : 'ojo'}
            icon={HandCoins}
          />
        ) : (
          <StatCard
            label="Goles del torneo"
            value={resumen.totalGoles ?? 0}
            detalle="anotados en total"
            tono={(resumen.totalGoles ?? 0) > 0 ? 'bueno' : 'neutro'}
            icon={Goal}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="flex flex-col gap-4">
          {/* El goleador es la cifra con más peso emocional del torneo: va destacada. */}
          <Card className="bg-sidebar text-sidebar-foreground border-none overflow-hidden relative">
            <CardContent className="p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Goleador del torneo</p>
              {resumen.topGoleador ? (
                <>
                  <p className="text-xl font-bold mt-2 leading-tight">{resumen.topGoleador.jugadorNombre}</p>
                  <p className="text-sm opacity-75">{resumen.topGoleador.equipoNombre}</p>
                  <div className="flex items-end gap-2 mt-3">
                    <span className="font-mono font-bold text-4xl leading-none tabular-nums">
                      {resumen.topGoleador.totalGoles ?? 0}
                    </span>
                    <span className="text-sm opacity-70 pb-1">goles</span>
                  </div>
                </>
              ) : (
                <p className="text-sm opacity-70 mt-3">Aún no hay goles registrados.</p>
              )}
              <Goal className="absolute -right-4 -bottom-4 h-24 w-24 opacity-10" aria-hidden />
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="w-4 h-5 bg-yellow-400 rounded-sm mx-auto mb-2 shadow-sm" aria-hidden />
                <p className="text-2xl font-mono font-bold tabular-nums">{resumen.totalAmarillas || 0}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-1">Amarillas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="w-4 h-5 bg-destructive rounded-sm mx-auto mb-2 shadow-sm" aria-hidden />
                <p className="text-2xl font-mono font-bold tabular-nums">{resumen.totalRojas || 0}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-1">Rojas</p>
              </CardContent>
            </Card>
          </div>

          {masLimpio && (
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Juego limpio</p>
                <p className="font-bold mt-1 leading-tight">{masLimpio.equipoNombre}</p>
                <p className="text-xs text-muted-foreground">
                  {masLimpio.puntajeFairplay ?? 0} puntos de sanción — el más disciplinado
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <CardTitle className="text-base">Tabla de posiciones</CardTitle>
            <Link href="/tablas" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              Ver completa <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table variant="torneo">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead>Equipo</TableHead>
                  <TableHead className="text-center font-mono">PJ</TableHead>
                  <TableHead className="text-center font-mono">DF</TableHead>
                  <TableHead className="text-right font-mono">PTS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topPosiciones.map((pos) => (
                  <TableRow key={pos.equipoId}>
                    <TableCell className="text-center font-mono font-bold text-muted-foreground">{pos.posicion}</TableCell>
                    <TableCell className="font-bold">
                      <NombreEquipo nombre={pos.equipoNombre} />
                    </TableCell>
                    <TableCell className="text-center font-mono tabular-nums">{pos.pj}</TableCell>
                    <TableCell className="text-center font-mono tabular-nums">{pos.df > 0 ? `+${pos.df}` : pos.df}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-primary text-lg tabular-nums">{pos.pts}</TableCell>
                  </TableRow>
                ))}
                {topPosiciones.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <EmptyState
                        mensaje="La tabla se arma sola cuando se registren resultados."
                        accion="Ir a Partidos"
                        href="/partidos"
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <CardTitle className="text-base">Últimos resultados</CardTitle>
          <Link href="/partidos" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
            Ver todos <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {recientes.length === 0 ? (
            <EmptyState
              mensaje="Todavía no hay partidos jugados."
              accion="Programar un partido"
              href="/partidos"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {recientes.map((partido) => {
                const localGana = (partido.golesLocal ?? 0) > (partido.golesVisitante ?? 0);
                const visitanteGana = (partido.golesVisitante ?? 0) > (partido.golesLocal ?? 0);
                return (
                  <div key={partido.id} className="border rounded-lg p-3 bg-muted/20">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <span className="text-[10px] text-muted-foreground font-mono uppercase font-bold tracking-wider">
                        Fecha {partido.semana}
                      </span>
                      {partido.walkover && (
                        <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">W.O.</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className={`flex-1 text-right truncate text-sm ${localGana ? 'font-bold' : 'text-muted-foreground'}`}
                        title={partido.localNombre}
                      >
                        {partido.localNombre}
                      </div>
                      <div className="px-2.5 py-1 bg-card border rounded font-mono font-bold shrink-0 tabular-nums">
                        {partido.golesLocal} - {partido.golesVisitante}
                      </div>
                      <div
                        className={`flex-1 text-left truncate text-sm ${visitanteGana ? 'font-bold' : 'text-muted-foreground'}`}
                        title={partido.visitanteNombre}
                      >
                        {partido.visitanteNombre}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
