import { useGetMiEquipo, useGetPosiciones } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShieldAlert, AlertTriangle, CalendarClock, Trophy, Ban } from 'lucide-react';
import { formatMoney, formatFecha, formatHora12 } from '@/lib/utils';

/**
 * La pantalla de inicio del delegado: su equipo y nada más.
 *
 * Todo sale de GET /mi-equipo, que el servidor acota al equipo de su
 * usuario — más la tabla de posiciones, que es pública y es la misma que ve
 * cualquiera en la cartelera.
 */
export default function MiEquipo() {
  const { data: mio, isLoading, error } = useGetMiEquipo();
  const { data: posiciones } = useGetPosiciones();

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Cargando...</div>;

  if (error || !mio) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-2">
          <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="font-semibold">No pudimos cargar tu equipo</p>
          <p className="text-sm text-muted-foreground">
            Si acabas de recibir tu usuario, puede que el Comité Organizador todavía no te haya asignado el equipo.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { equipo, cuenta, plantilla, proximoPartido } = mio;
  const miPosicion = posiciones?.find((p) => p.equipoId === equipo.id);
  const puesto = posiciones ? posiciones.findIndex((p) => p.equipoId === equipo.id) + 1 : 0;

  const sancionados = plantilla.filter((j) => j.fechasPendientes > 0);
  const sinCarnet = plantilla.filter((j) => !j.carnetPagado);

  const alertas = [
    sancionados.length > 0 && {
      icono: Ban,
      tono: 'destructive' as const,
      titulo: sancionados.length === 1 ? '1 jugador sancionado' : `${sancionados.length} jugadores sancionados`,
      detalle: sancionados
        .map((j) => `${j.nombre} (${j.fechasPendientes === 1 ? '1 fecha' : `${j.fechasPendientes} fechas`})`)
        .join(' · '),
    },
    cuenta.saldoInscripcion > 0 && {
      icono: AlertTriangle,
      tono: 'warning' as const,
      titulo: `Te faltan ${formatMoney(cuenta.saldoInscripcion)} de inscripción`,
      detalle: `Llevas pagados ${formatMoney(cuenta.pagadoInscripcion)} de ${formatMoney(cuenta.deudaInscripcion)}.`,
    },
    cuenta.amarillasSinPagar > 0 && {
      icono: AlertTriangle,
      tono: 'warning' as const,
      titulo: `${cuenta.amarillasSinPagar} tarjeta(s) amarilla(s) sin pagar`,
      detalle: `Suman ${formatMoney(cuenta.valorAmarillasSinPagar)}.`,
    },
    sinCarnet.length > 0 && {
      icono: AlertTriangle,
      tono: 'warning' as const,
      titulo: `${sinCarnet.length} jugador(es) sin carné pagado`,
      detalle: `Suman ${formatMoney(cuenta.valorCarnetsSinPagar)}.`,
    },
  ].filter(Boolean) as Array<{
    icono: typeof Ban;
    tono: 'destructive' | 'warning';
    titulo: string;
    detalle: string;
  }>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* ── Encabezado ── */}
      <div className="flex items-center gap-3">
        <div
          className="p-3 rounded-lg text-primary bg-primary/10"
          style={equipo.color ? { background: `${equipo.color}22`, color: equipo.color } : undefined}
        >
          <ShieldAlert className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{equipo.nombre}</h1>
          <p className="text-muted-foreground mt-1">
            {miPosicion
              ? `${puesto}º en la tabla · ${miPosicion.pts} puntos · ${miPosicion.pj} jugados`
              : 'Tu equipo en el torneo'}
          </p>
        </div>
      </div>

      {/* ── Lo que hay que atender ── */}
      {alertas.length > 0 && (
        <div className="space-y-2">
          {alertas.map((a) => (
            <Card
              key={a.titulo}
              className={a.tono === 'destructive' ? 'border-destructive/50 bg-destructive/5' : 'border-amber-500/50 bg-amber-500/5'}
            >
              <CardContent className="p-4 flex items-start gap-3">
                <a.icono
                  className={`h-5 w-5 shrink-0 mt-0.5 ${a.tono === 'destructive' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}
                />
                <div className="min-w-0">
                  <p className="font-bold text-sm">{a.titulo}</p>
                  <p className="text-sm text-muted-foreground break-words">{a.detalle}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Próximo partido ── */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              <h2 className="font-bold text-sm">Tu próximo partido</h2>
            </div>
            {!proximoPartido ? (
              <p className="text-sm text-muted-foreground">No tienes partidos programados por ahora.</p>
            ) : (
              <>
                <p className="text-xl font-extrabold">
                  {proximoPartido.deLocal ? 'vs' : 'visitas a'} {proximoPartido.rivalNombre}
                </p>
                <p className="text-sm text-muted-foreground">
                  {proximoPartido.fecha ? formatFecha(proximoPartido.fecha) : 'Sin fecha'}
                  {proximoPartido.hora && ` · ${formatHora12(proximoPartido.hora)}`}
                  {proximoPartido.fase && ` · ${proximoPartido.fase}`}
                </p>
                {proximoPartido.arbitroNombre && (
                  <p className="text-xs text-muted-foreground">Árbitro: {proximoPartido.arbitroNombre}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Su renglón en la tabla ── */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="h-4 w-4 text-primary" />
              <h2 className="font-bold text-sm">Tu campaña</h2>
            </div>
            {!miPosicion ? (
              <p className="text-sm text-muted-foreground">Todavía sin partidos jugados.</p>
            ) : (
              <div className="grid grid-cols-3 gap-y-2 text-center">
                {[
                  ['PJ', miPosicion.pj],
                  ['PG', miPosicion.pg],
                  ['PE', miPosicion.pe],
                  ['PP', miPosicion.pp],
                  ['GF', miPosicion.gf],
                  ['GC', miPosicion.gc],
                ].map(([etiqueta, valor]) => (
                  <div key={etiqueta as string}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{etiqueta}</p>
                    <p className="font-mono font-bold">{valor}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── La plantilla ── */}
      <Card>
        <CardContent className="p-0">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-bold">Tu plantilla</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {plantilla.length} jugadores inscritos
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table variant="torneo">
              <TableHeader>
                <TableRow>
                  <TableHead>Carné</TableHead>
                  <TableHead>Jugador</TableHead>
                  <TableHead className="text-center">PJ</TableHead>
                  <TableHead className="text-center">Goles</TableHead>
                  <TableHead className="text-center">Amar.</TableHead>
                  <TableHead className="text-center">Rojas</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plantilla.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                      Todavía no hay jugadores inscritos en tu equipo.
                    </TableCell>
                  </TableRow>
                ) : (
                  plantilla.map((j) => (
                    <TableRow key={j.jugadorId} className={j.fechasPendientes > 0 ? 'bg-destructive/5' : ''}>
                      <TableCell className="font-mono text-muted-foreground">
                        {j.nCarnet ? `#${String(j.nCarnet).padStart(4, '0')}` : '—'}
                      </TableCell>
                      <TableCell className="font-bold">{j.nombre}</TableCell>
                      <TableCell className="text-center font-mono tabular-nums">{j.partidosJugados}</TableCell>
                      <TableCell className="text-center font-mono tabular-nums font-bold">{j.goles || '—'}</TableCell>
                      <TableCell className="text-center font-mono tabular-nums">{j.amarillas || '—'}</TableCell>
                      <TableCell className="text-center font-mono tabular-nums">{j.rojas || '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {j.fechasPendientes > 0 ? (
                          <Badge variant="destructive">
                            No puede jugar · {j.fechasPendientes === 1 ? '1 fecha' : `${j.fechasPendientes} fechas`}
                          </Badge>
                        ) : !j.carnetPagado ? (
                          <Badge variant="warning">Carné sin pagar</Badge>
                        ) : (
                          <Badge variant="success">Habilitado</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
