import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useGetPartidos,
  useGetAjustes,
  useGetArbitros,
  useGuardarMesa,
  useCambiarEstadoMesa,
  useUpdatePartido,
  useGetMesas,
  useGetResumenMesas,
  useBorrarMesa,
  getGetMesaPorFechaQueryOptions,
  getGetMesaPorFechaQueryKey,
  getGetMesasQueryKey,
  getGetResumenMesasQueryKey,
  getGetPartidosQueryKey,
  type Ajustes,
  type MesaDetalle,
  type Partido,
} from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { TablaImprimible } from '@/components/tabla-imprimible';
import { ImprimirPortal } from '@/components/imprimir-portal';
import { SelectorArbitro } from '@/components/selector-arbitro';
import { useImprimir } from '@/hooks/use-imprimir';
import { useToast } from '@/hooks/use-toast';
import { extractErrorMessage } from '@/lib/api-errors';
import { formatMoney, formatFecha } from '@/lib/utils';
import { useAuth, canWrite } from '@/lib/auth';
import {
  Coins, Printer, Save, Lock, Unlock, Plus, Trash2, TrendingUp, TrendingDown, Wallet, AlertTriangle, History,
} from 'lucide-react';

/**
 * La mesa: el cuadre de caja de un día de juego.
 *
 * Lo que entra son los pagos de arbitraje de cada equipo que juega ese día
 * (más las cintas de capitán) y lo que sale son los árbitros, la cal, los
 * balones y la ayuda a los trabajadores. Lo que queda pasa a la caja del
 * torneo — y pasa solo, porque los ingresos se guardan como pagos y los
 * gastos como egresos, que es de donde Tesorería saca su saldo.
 *
 * Los equipos del día no se escriben a mano: salen de los partidos
 * programados para esa fecha. El valor que le toca a cada uno también sale
 * solo de Ajustes, y se duplica en las fases que se juegan con terna.
 *
 * El arbitraje va por partido, no por día: un mismo sábado se juegan varios
 * y cada uno puede llevar su propio árbitro, cobrando distinto. Por eso cada
 * gasto de arbitraje queda enlazado a su partido (egresos.partido_id).
 */

const CONCEPTO_MESA = 'Mesa';
const CONCEPTO_CINTA = 'Cinta de capitán';

const CATEGORIA_ARBITRAJE = 'Arbitraje';
const CATEGORIA_CAL = 'Cal';
const CATEGORIA_BALONES = 'Balones';
const CATEGORIA_TRABAJADORES = 'Trabajadores';

/** Fases que se pueden jugar con terna: ahí cada equipo paga el doble. */
const CASILLA_TERNA_POR_FASE: Record<string, keyof Ajustes> = {
  'Final liguilla': 'ternaFinalLiguilla',
  'Muerte súbita': 'ternaMuerteSubita',
  'Semifinal liguilla': 'ternaSemifinalLiguilla',
  'Semifinal del torneo': 'ternaSemifinalTorneo',
  'Final del torneo': 'ternaFinalTorneo',
};

/** Lo que se le paga al árbitro según la fase (el gasto, no lo que entra). */
const ARBITRO_POR_FASE: Record<string, { simple: keyof Ajustes; terna?: keyof Ajustes }> = {
  'Primera vuelta': { simple: 'valorArbitrajePrimeraVuelta' },
  'Segunda vuelta': { simple: 'valorArbitrajeSegundaVuelta' },
  'Final liguilla': { simple: 'valorArbitrajeFinalLiguilla', terna: 'valorTernaFinalLiguilla' },
  'Muerte súbita': { simple: 'valorArbitrajeMuerteSubita', terna: 'valorTernaMuerteSubita' },
  'Semifinal liguilla': { simple: 'valorArbitrajeSemifinalLiguilla', terna: 'valorTernaSemifinalLiguilla' },
  'Semifinal del torneo': { simple: 'valorArbitrajeSemifinalTorneo', terna: 'valorTernaSemifinalTorneo' },
  'Final del torneo': { simple: 'valorArbitrajeFinalTorneo', terna: 'valorTernaFinalTorneo' },
};

function hayTerna(fase: string | null | undefined, ajustes?: Ajustes): boolean {
  if (!fase || !ajustes) return false;
  const casilla = CASILLA_TERNA_POR_FASE[fase];
  return casilla ? Boolean(ajustes[casilla]) : false;
}

/** Lo que paga cada equipo por ese partido: el valor de la mesa, doble si es terna. */
function valorMesaDelPartido(partido: Partido, ajustes?: Ajustes): number {
  const base = ajustes?.valorMesa ?? 0;
  return hayTerna(partido.fase, ajustes) ? base * 2 : base;
}

/** Lo que se le paga al árbitro de ese partido, según la fase. */
function valorArbitroDelPartido(partido: Partido, ajustes?: Ajustes): number {
  if (!partido.fase || !ajustes) return 0;
  const campos = ARBITRO_POR_FASE[partido.fase];
  if (!campos) return 0;
  const usarTerna = hayTerna(partido.fase, ajustes) && campos.terna;
  const campo = usarTerna ? campos.terna! : campos.simple;
  return Number(ajustes[campo] ?? 0);
}

interface LineaEquipo {
  clave: string;
  equipoId: number;
  equipoNombre: string;
  fase: string | null;
  rival: string;
  valor: number;
  pago: boolean;
  /** Cintas de capitán que compró ese equipo ese día. */
  cintas: number;
}

interface LineaGasto {
  clave: string;
  descripcion: string;
  valor: number;
}

/** El árbitro de un partido puntual del día, con lo que se le paga. */
interface LineaArbitro {
  partidoId: number;
  enfrentamiento: string;
  fase: string | null;
  arbitroId: number | null;
  valor: number;
}

function numeroDeInput(valor: string): number {
  // Un campo vacío vale cero, no NaN: así no se rompe la suma mientras se
  // está escribiendo.
  const n = Number(valor.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export default function Mesa({ embebido }: { embebido?: boolean } = {}) {
  const { role } = useAuth();
  const puedeEscribir = canWrite(role, '/tesoreria');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { imprimiendo, imprimir } = useImprimir();

  const { data: partidos } = useGetPartidos();
  const { data: ajustes } = useGetAjustes();

  // Los días con partidos programados: son los días que pueden tener mesa.
  const fechasDisponibles = useMemo(() => {
    const fechas = (partidos ?? []).map((p) => p.fecha).filter((f): f is string => !!f);
    return [...new Set(fechas)].sort().reverse();
  }, [partidos]);

  const [fecha, setFecha] = useState<string>('');
  useEffect(() => {
    if (!fecha && fechasDisponibles.length > 0) setFecha(fechasDisponibles[0]);
  }, [fecha, fechasDisponibles]);

  // useGetMesaPorFecha(fecha, { query: { enabled } }) no compila: el tipo
  // generado exige "queryKey" ahí aunque en tiempo de ejecución lo complete
  // por dentro. Mismo rodeo que en pagos-resumen.tsx y posiciones.tsx.
  const { data: detalle } = useQuery<MesaDetalle>({
    ...getGetMesaPorFechaQueryOptions(fecha),
    enabled: !!fecha,
  });
  const guardar = useGuardarMesa();
  const cambiarEstado = useCambiarEstadoMesa();
  const actualizarPartido = useUpdatePartido();
  const { data: todosLosArbitros } = useGetArbitros();

  const cerrada = detalle?.mesa?.estado === 'cerrada';
  const bloqueado = cerrada || !puedeEscribir;

  const partidosDelDia = useMemo(
    () => (partidos ?? []).filter((p) => p.fecha === fecha),
    [partidos, fecha],
  );

  // ── Estado editable de la planilla ────────────────────────────────────────
  const [lineas, setLineas] = useState<LineaEquipo[]>([]);
  // Un árbitro por partido: el mismo día se juegan varios y cada uno puede
  // llevar el suyo, cobrando distinto.
  const [arbitros, setArbitros] = useState<LineaArbitro[]>([]);
  const [cal, setCal] = useState(0);
  const [balones, setBalones] = useState(0);
  const [trabajadores, setTrabajadores] = useState<LineaGasto[]>([]);
  const [otros, setOtros] = useState<LineaGasto[]>([]);

  // Cada vez que cambia el día (o llega lo guardado del servidor) se rearma
  // la planilla: los equipos salen de los partidos y lo ya guardado manda
  // sobre los valores sugeridos.
  useEffect(() => {
    if (!fecha || !detalle) return;

    const guardadosMesa = (detalle.ingresos ?? []).filter((i) => i.concepto === CONCEPTO_MESA);
    const pagadosPorEquipo = new Map<number, number>();
    for (const i of guardadosMesa) {
      if (i.equipoId == null) continue;
      pagadosPorEquipo.set(i.equipoId, (pagadosPorEquipo.get(i.equipoId) ?? 0) + 1);
    }
    const montoPorEquipo = new Map<number, number>();
    for (const i of guardadosMesa) {
      if (i.equipoId != null && !montoPorEquipo.has(i.equipoId)) montoPorEquipo.set(i.equipoId, i.monto);
    }

    // Las cintas guardadas, por equipo, para volverlas a mostrar como cantidad.
    const valorCintaGuardado = ajustes?.valorCintaCapitan ?? 0;
    const cintasPorEquipo = new Map<number, number>();
    for (const i of detalle.ingresos ?? []) {
      if (i.concepto !== CONCEPTO_CINTA || i.equipoId == null) continue;
      const cantidad = valorCintaGuardado > 0 ? Math.round(i.monto / valorCintaGuardado) : 0;
      cintasPorEquipo.set(i.equipoId, (cintasPorEquipo.get(i.equipoId) ?? 0) + cantidad);
    }

    const nuevas: LineaEquipo[] = [];
    const cintasPendientes = new Map(cintasPorEquipo);
    for (const p of partidosDelDia) {
      const sugerido = valorMesaDelPartido(p, ajustes);
      for (const lado of ['local', 'visitante'] as const) {
        const equipoId = lado === 'local' ? p.localId : p.visitanteId;
        const equipoNombre = lado === 'local' ? p.localNombre : p.visitanteNombre;
        const rival = lado === 'local' ? p.visitanteNombre : p.localNombre;
        const pendientes = pagadosPorEquipo.get(equipoId) ?? 0;
        const yaPago = pendientes > 0;
        if (yaPago) pagadosPorEquipo.set(equipoId, pendientes - 1);
        // Las cintas se muestran una sola vez por equipo, en su primera fila.
        const cintasDelEquipo = cintasPendientes.get(equipoId) ?? 0;
        cintasPendientes.set(equipoId, 0);
        nuevas.push({
          clave: `${p.id}-${equipoId}`,
          equipoId,
          equipoNombre,
          fase: p.fase ?? null,
          rival,
          valor: yaPago ? (montoPorEquipo.get(equipoId) ?? sugerido) : sugerido,
          pago: yaPago,
          cintas: cintasDelEquipo,
        });
      }
    }
    setLineas(nuevas);

    const gastos = detalle.egresos ?? [];
    const guardadoCal = gastos.find((e) => e.categoria === CATEGORIA_CAL);
    const guardadoBalones = gastos.find((e) => e.categoria === CATEGORIA_BALONES);

    // Una fila de árbitro por partido del día. Quién dirige sale siempre del
    // partido mismo (partido.arbitroId, ya sea que se haya asignado desde
    // Partidos, la Planilla o aquí mismo): esa es la única fuente de verdad
    // de la identidad. Lo que se le paga sale de lo ya guardado en la mesa,
    // o si no, de lo que le corresponde a esa fase en Ajustes.
    const arbitrosGuardados = gastos.filter((e) => e.categoria === CATEGORIA_ARBITRAJE);
    const porPartido = new Map(
      arbitrosGuardados.filter((e) => e.partidoId != null).map((e) => [e.partidoId!, e]),
    );
    // Lo que quedó de antes de que el arbitraje se llevara por partido: una
    // sola línea suelta, sin partido. Se le asigna al primero del día para
    // no perder el valor pagado.
    const sueltos = arbitrosGuardados.filter((e) => e.partidoId == null);

    setArbitros(
      partidosDelDia.map((p, i) => {
        const guardado = porPartido.get(p.id) ?? (i === 0 ? sueltos[0] : undefined);
        return {
          partidoId: p.id,
          enfrentamiento: `${p.localNombre} vs ${p.visitanteNombre}`,
          fase: p.fase ?? null,
          arbitroId: p.arbitroId ?? null,
          valor: guardado?.valor ?? valorArbitroDelPartido(p, ajustes),
        };
      }),
    );
    setCal(guardadoCal?.valor ?? 0);
    setBalones(guardadoBalones?.valor ?? 0);
    setTrabajadores(
      gastos
        .filter((e) => e.categoria === CATEGORIA_TRABAJADORES)
        .map((e, i) => ({ clave: `t-${e.id}-${i}`, descripcion: e.descripcion, valor: e.valor })),
    );
    setOtros(
      gastos
        .filter(
          (e) =>
            e.categoria !== CATEGORIA_ARBITRAJE &&
            e.categoria !== CATEGORIA_CAL &&
            e.categoria !== CATEGORIA_BALONES &&
            e.categoria !== CATEGORIA_TRABAJADORES,
        )
        .map((e, i) => ({ clave: `o-${e.id}-${i}`, descripcion: e.descripcion, valor: e.valor })),
    );
  }, [fecha, detalle, partidosDelDia, ajustes]);

  // ── Totales ───────────────────────────────────────────────────────────────
  const valorCinta = ajustes?.valorCintaCapitan ?? 0;
  const totalCintas = lineas.reduce((s, l) => s + l.cintas * valorCinta, 0);
  const totalIngresos = lineas.filter((l) => l.pago).reduce((s, l) => s + l.valor, 0) + totalCintas;
  const totalArbitros = arbitros.reduce((s, a) => s + a.valor, 0);
  const totalEgresos =
    totalArbitros +
    cal +
    balones +
    trabajadores.reduce((s, t) => s + t.valor, 0) +
    otros.reduce((s, o) => s + o.valor, 0);
  const saldo = totalIngresos - totalEgresos;

  const sinPagar = lineas.filter((l) => !l.pago);
  const noAlcanza = totalIngresos < totalArbitros && totalArbitros > 0;

  function actualizarLinea(clave: string, cambios: Partial<LineaEquipo>) {
    setLineas((prev) => prev.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  }

  function actualizarArbitro(partidoId: number, cambios: Partial<LineaArbitro>) {
    setArbitros((prev) => prev.map((a) => (a.partidoId === partidoId ? { ...a, ...cambios } : a)));
  }

  async function onGuardar() {
    const ingresos = [
      ...lineas
        .filter((l) => l.pago)
        .map((l) => ({ equipoId: l.equipoId, concepto: CONCEPTO_MESA, monto: l.valor })),
      ...lineas
        .filter((l) => l.cintas > 0 && valorCinta > 0)
        .map((l) => ({ equipoId: l.equipoId, concepto: CONCEPTO_CINTA, monto: l.cintas * valorCinta })),
    ];
    const nombreDeArbitro = (id: number | null) => todosLosArbitros?.find((a) => a.id === id)?.nombre;
    const egresos = [
      ...arbitros
        .filter((a) => a.valor > 0)
        .map((a) => ({
          categoria: CATEGORIA_ARBITRAJE,
          descripcion: nombreDeArbitro(a.arbitroId) ?? 'Árbitro sin asignar',
          valor: a.valor,
          partidoId: a.partidoId,
        })),
      ...(cal > 0 ? [{ categoria: CATEGORIA_CAL, descripcion: 'Cal', valor: cal }] : []),
      ...(balones > 0 ? [{ categoria: CATEGORIA_BALONES, descripcion: 'Balones', valor: balones }] : []),
      ...trabajadores
        .filter((t) => t.valor > 0 && t.descripcion.trim())
        .map((t) => ({ categoria: CATEGORIA_TRABAJADORES, descripcion: t.descripcion.trim(), valor: t.valor })),
      ...otros
        .filter((o) => o.valor > 0 && o.descripcion.trim())
        .map((o) => ({ categoria: 'Otro', descripcion: o.descripcion.trim(), valor: o.valor })),
    ];

    try {
      await guardar.mutateAsync({ fecha, data: { ingresos, egresos } });
      // Quién dirige cada partido se decide aquí mismo (o se corrige): se
      // guarda en el partido, que es donde vive de verdad esa identidad —
      // así Partidos y la Planilla lo ven igual, y las estadísticas del
      // árbitro (en /arbitros) cuentan este partido como suyo.
      const partidosDelDiaPorId = new Map(partidosDelDia.map((p) => [p.id, p]));
      const cambiosDeArbitro = arbitros.filter(
        (a) => (partidosDelDiaPorId.get(a.partidoId)?.arbitroId ?? null) !== a.arbitroId,
      );
      await Promise.all(
        cambiosDeArbitro.map((a) =>
          actualizarPartido.mutateAsync({ id: a.partidoId, data: { arbitroId: a.arbitroId } }),
        ),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetMesaPorFechaQueryKey(fecha) }),
        cambiosDeArbitro.length > 0
          ? queryClient.invalidateQueries({ queryKey: getGetPartidosQueryKey() })
          : Promise.resolve(),
      ]);
      toast({ title: 'Mesa guardada', description: `Quedó un saldo de ${formatMoney(saldo)}.` });
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: extractErrorMessage(err), variant: 'destructive' });
    }
  }

  /**
   * Desde el historial: reabre esa mesa y salta a ese día, para poder
   * corregirla de una. Sin esto tocaba cambiar de día arriba y recién ahí
   * darle "Abrir de nuevo".
   */
  async function reabrirYCorregir(mesaId: number, fechaMesa: string) {
    try {
      await cambiarEstado.mutateAsync({ id: mesaId, data: { estado: 'abierta' } });
      await queryClient.invalidateQueries({ queryKey: getGetMesaPorFechaQueryKey(fechaMesa) });
      setFecha(fechaMesa);
      toast({ title: 'Mesa abierta', description: `Ya puedes corregir la del ${formatFecha(fechaMesa)}.` });
    } catch (err) {
      toast({ title: 'No se pudo abrir', description: extractErrorMessage(err), variant: 'destructive' });
    }
  }

  async function onCambiarEstado(nuevo: 'abierta' | 'cerrada') {
    if (!detalle?.mesa) return;
    try {
      await cambiarEstado.mutateAsync({ id: detalle.mesa.id, data: { estado: nuevo } });
      await queryClient.invalidateQueries({ queryKey: getGetMesaPorFechaQueryKey(fecha) });
      toast({ title: nuevo === 'cerrada' ? 'Mesa cerrada' : 'Mesa abierta de nuevo' });
    } catch (err) {
      toast({ title: 'No se pudo cambiar', description: extractErrorMessage(err), variant: 'destructive' });
    }
  }

  // ── Planilla para imprimir ────────────────────────────────────────────────
  const filasImpresion = [
    ...lineas
      .filter((l) => l.pago)
      .map((l) => ({
        clave: `i-${l.clave}`,
        celdas: ['Mesa', `${l.equipoNombre} (vs ${l.rival})`, formatMoney(l.valor), '—'],
      })),
    ...lineas
      .filter((l) => l.cintas > 0 && valorCinta > 0)
      .map((l) => ({
        clave: `c-${l.clave}`,
        celdas: [
          'Cintas de capitán',
          `${l.equipoNombre} · ${l.cintas} × ${formatMoney(valorCinta)}`,
          formatMoney(l.cintas * valorCinta),
          '—',
        ],
      })),
    ...arbitros
      .filter((a) => a.valor > 0)
      .map((a) => ({
        clave: `e-arb-${a.partidoId}`,
        celdas: [
          'Árbitro',
          `${todosLosArbitros?.find((x) => x.id === a.arbitroId)?.nombre ?? 'Sin asignar'} · ${a.enfrentamiento}`,
          '—',
          formatMoney(a.valor),
        ],
      })),
    ...(cal > 0 ? [{ clave: 'e-cal', celdas: ['Cal', '—', '—', formatMoney(cal)] }] : []),
    ...(balones > 0 ? [{ clave: 'e-balones', celdas: ['Balones', '—', '—', formatMoney(balones)] }] : []),
    ...trabajadores
      .filter((t) => t.valor > 0)
      .map((t, i) => ({
        clave: `e-trab-${i}`,
        celdas: ['Trabajadores', t.descripcion || '—', '—', formatMoney(t.valor)],
      })),
    ...otros
      .filter((o) => o.valor > 0)
      .map((o, i) => ({ clave: `e-otro-${i}`, celdas: ['Otro', o.descripcion || '—', '—', formatMoney(o.valor)] })),
  ];

  const planilla = (
    <TablaImprimible
      titulo="Planilla de mesa"
      subtitulo={fecha ? formatFecha(fecha) : undefined}
      columnas={[
        { encabezado: 'Concepto' },
        { encabezado: 'Detalle' },
        { encabezado: 'Entra', alineacion: 'derecha' },
        { encabezado: 'Sale', alineacion: 'derecha' },
      ]}
      filas={filasImpresion}
      nota={`Entró ${formatMoney(totalIngresos)} · Salió ${formatMoney(totalEgresos)} · Queda ${formatMoney(saldo)}`}
    />
  );

  return (
    <div className="space-y-4">
      {!embebido && (
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 text-primary rounded-lg">
            <Coins className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Mesa</h1>
            <p className="text-muted-foreground mt-1">La caja de cada día de juego</p>
          </div>
        </div>
      )}

      {/* Día + estado + acciones */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Día de juego</Label>
          <Select value={fecha} onValueChange={setFecha}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Elige una fecha" /></SelectTrigger>
            <SelectContent>
              {fechasDisponibles.map((f) => (
                <SelectItem key={f} value={f}>{formatFecha(f)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {detalle?.mesa && (
          <Badge variant={cerrada ? 'secondary' : 'success'} className="mb-2 gap-1">
            {cerrada ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
            {cerrada ? 'Cerrada' : 'Abierta'}
          </Badge>
        )}

        <span className="ml-auto flex items-center gap-2 mb-1">
          <Button variant="ghost" size="icon" onClick={imprimir} aria-label="Imprimir planilla de mesa">
            <Printer className="h-4 w-4" />
          </Button>
          {puedeEscribir && (
            <>
              <Button onClick={onGuardar} disabled={!fecha || cerrada || guardar.isPending}>
                <Save className="h-4 w-4 mr-1.5" />
                Guardar
              </Button>
              {detalle?.mesa && (
                <Button
                  variant="outline"
                  onClick={() => onCambiarEstado(cerrada ? 'abierta' : 'cerrada')}
                  disabled={cambiarEstado.isPending}
                >
                  {cerrada ? 'Abrir de nuevo' : 'Cerrar mesa'}
                </Button>
              )}
            </>
          )}
        </span>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-xs text-muted-foreground">Entró</p>
              <p className="text-xl font-bold">{formatMoney(totalIngresos)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingDown className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-xs text-muted-foreground">Salió</p>
              <p className="text-xl font-bold">{formatMoney(totalEgresos)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Wallet className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Queda para el torneo</p>
              <p className={`text-xl font-bold ${saldo < 0 ? 'text-destructive' : ''}`}>{formatMoney(saldo)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {noAlcanza && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p>
            Con lo que entró no alcanza para pagarle al árbitro
            {sinPagar.length > 0 && <> — faltan por pagar {sinPagar.length} equipo(s).</>}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* ── Lo que entra ── */}
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b">
              <h3 className="font-bold text-sm">Lo que entra</h3>
              <p className="text-xs text-muted-foreground">Los equipos salen solos de los partidos del día</p>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">Pagó</TableHead>
                  <TableHead>Equipo</TableHead>
                  <TableHead className="text-right w-28">Mesa</TableHead>
                  <TableHead className="text-center w-20">Cintas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineas.map((l) => (
                  <TableRow key={l.clave} className={l.pago ? '' : 'opacity-60'}>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={l.pago}
                        disabled={bloqueado}
                        onCheckedChange={(v) => actualizarLinea(l.clave, { pago: Boolean(v) })}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-sm">{l.equipoNombre}</div>
                      <div className="text-xs text-muted-foreground">
                        vs {l.rival}
                        {hayTerna(l.fase, ajustes) && <span className="ml-1 font-semibold">· terna (doble)</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        className="h-8 text-right"
                        disabled={bloqueado}
                        value={l.valor === 0 ? '' : String(l.valor)}
                        placeholder="0"
                        onChange={(e) => actualizarLinea(l.clave, { valor: numeroDeInput(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Input
                        className="h-8 text-center"
                        disabled={bloqueado || valorCinta === 0}
                        value={l.cintas === 0 ? '' : String(l.cintas)}
                        placeholder="0"
                        onChange={(e) => actualizarLinea(l.clave, { cintas: numeroDeInput(e.target.value) })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {lineas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">
                      No hay partidos programados para ese día.
                    </TableCell>
                  </TableRow>
                )}
                {lineas.length > 0 && (
                  <TableRow>
                    <TableCell />
                    <TableCell className="text-xs text-muted-foreground">
                      {valorCinta > 0
                        ? `Cintas de capitán a ${formatMoney(valorCinta)} cada una`
                        : 'Para cobrar cintas, ponle un valor en Ajustes'}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatMoney(totalCintas)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* ── Lo que sale ── */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <h3 className="font-bold text-sm">Lo que sale</h3>
              <p className="text-xs text-muted-foreground">Cada partido lleva su propio árbitro; el valor se sugiere según la fase</p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label>
                  Árbitros <span className="text-muted-foreground font-normal">· uno por partido</span>
                </Label>
                {arbitros.length > 0 && (
                  <span className="text-xs text-muted-foreground">{formatMoney(totalArbitros)}</span>
                )}
              </div>

              {arbitros.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay partidos programados para ese día.</p>
              ) : (
                arbitros.map((a) => (
                  <div key={a.partidoId} className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {a.enfrentamiento}
                      {a.fase && <span className="ml-1">· {a.fase}</span>}
                      {hayTerna(a.fase, ajustes) && <span className="ml-1 font-semibold">· terna</span>}
                    </p>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <SelectorArbitro
                          value={a.arbitroId}
                          onChange={(arbitroId) => actualizarArbitro(a.partidoId, { arbitroId })}
                          disabled={bloqueado}
                        />
                      </div>
                      <Input
                        className="w-32 text-right"
                        placeholder="0"
                        disabled={bloqueado}
                        value={a.valor === 0 ? '' : String(a.valor)}
                        onChange={(e) => actualizarArbitro(a.partidoId, { valor: numeroDeInput(e.target.value) })}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Cal</Label>
                <Input
                  className="text-right"
                  placeholder="0"
                  disabled={bloqueado}
                  value={cal === 0 ? '' : String(cal)}
                  onChange={(e) => setCal(numeroDeInput(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Balones <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Input
                  className="text-right"
                  placeholder="0"
                  disabled={bloqueado}
                  value={balones === 0 ? '' : String(balones)}
                  onChange={(e) => setBalones(numeroDeInput(e.target.value))}
                />
              </div>
            </div>

            <ListaGastos
              titulo="Trabajadores"
              ayuda="Lo que se les dé ese día"
              placeholder="Nombre"
              lineas={trabajadores}
              onChange={setTrabajadores}
              bloqueado={bloqueado}
              prefijo="t"
            />

            <ListaGastos
              titulo="Otros gastos"
              placeholder="¿En qué se gastó?"
              lineas={otros}
              onChange={setOtros}
              bloqueado={bloqueado}
              prefijo="o"
            />
          </CardContent>
        </Card>
      </div>

      <HistorialMesas
        fechaActual={fecha}
        onVerDia={setFecha}
        onCorregir={reabrirYCorregir}
        puedeEscribir={puedeEscribir}
      />

      <ImprimirPortal activo={imprimiendo}>{planilla}</ImprimirPortal>
    </div>
  );
}

function ListaGastos({
  titulo,
  ayuda,
  placeholder,
  lineas,
  onChange,
  bloqueado,
  prefijo,
}: {
  titulo: string;
  ayuda?: string;
  placeholder: string;
  lineas: LineaGasto[];
  onChange: (lineas: LineaGasto[]) => void;
  bloqueado: boolean;
  prefijo: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>
          {titulo}
          {ayuda && <span className="text-muted-foreground font-normal"> · {ayuda}</span>}
        </Label>
        {!bloqueado && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange([...lineas, { clave: `${prefijo}-nuevo-${Date.now()}`, descripcion: '', valor: 0 }])
            }
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Agregar
          </Button>
        )}
      </div>

      {lineas.length === 0 && <p className="text-xs text-muted-foreground">Nada por ahora.</p>}

      {lineas.map((linea, i) => (
        <div key={linea.clave} className="flex gap-2">
          <Input
            placeholder={placeholder}
            disabled={bloqueado}
            value={linea.descripcion}
            onChange={(e) => {
              const copia = [...lineas];
              copia[i] = { ...linea, descripcion: e.target.value };
              onChange(copia);
            }}
          />
          <Input
            className="w-28 text-right"
            placeholder="0"
            disabled={bloqueado}
            value={linea.valor === 0 ? '' : String(linea.valor)}
            onChange={(e) => {
              const copia = [...lineas];
              copia[i] = { ...linea, valor: numeroDeInput(e.target.value) };
              onChange(copia);
            }}
          />
          {!bloqueado && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(lineas.filter((_, j) => j !== i))}
              aria-label={`Quitar ${titulo.toLowerCase()}`}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * El historial: qué dejó cada día de juego y en qué se fue la plata en todo
 * el torneo. Va debajo del cuadre del día porque es la historia de lo mismo
 * que se está mirando arriba — al hacer clic en una fila, se abre ese día.
 *
 * Respeta el torneo que se esté viendo: con un torneo cerrado seleccionado,
 * muestra el historial de ese año (ver lib/temporada.tsx).
 */
function HistorialMesas({
  fechaActual,
  onVerDia,
  onCorregir,
  puedeEscribir,
}: {
  fechaActual: string;
  onVerDia: (fecha: string) => void;
  onCorregir: (mesaId: number, fecha: string) => void;
  puedeEscribir: boolean;
}) {
  const { data: mesas } = useGetMesas();
  const { data: resumen } = useGetResumenMesas();
  const { imprimiendo, imprimir } = useImprimir();
  const borrarMesa = useBorrarMesa();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  /**
   * Borrar un día del historial se lleva TODA la plata de ese día: los
   * recibos que entraron y los gastos que salieron. La fila de la mesa sola
   * es apenas el encabezado — si se borrara solo ella, esos recibos y gastos
   * quedarían sueltos en Tesorería sumando al saldo sin pertenecer a ningún
   * día, que es justo lo que no se quiere.
   */
  async function onBorrar(mesa: { id: number; fecha: string }) {
    try {
      const borrado = await borrarMesa.mutateAsync({ id: mesa.id });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetMesasQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetResumenMesasQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetMesaPorFechaQueryKey(mesa.fecha) }),
        queryClient.invalidateQueries({ queryKey: ['/api/pagos'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/egresos'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/equipos'] }),
      ]);
      toast({
        title: `Se borró la mesa del ${formatFecha(mesa.fecha)}`,
        description: `Con ella se fueron ${borrado.pagosBorrados} recibo(s) y ${borrado.egresosBorrados} gasto(s).`,
      });
    } catch (err) {
      toast({ title: 'No se pudo borrar', description: extractErrorMessage(err), variant: 'destructive' });
    }
  }

  const filas = mesas ?? [];
  const totales = filas.reduce(
    (acc, m) => ({
      ingresos: acc.ingresos + m.totalIngresos,
      egresos: acc.egresos + m.totalEgresos,
      saldo: acc.saldo + m.saldo,
    }),
    { ingresos: 0, egresos: 0, saldo: 0 },
  );

  if (filas.length === 0) return null;

  const bloqueResumen = (titulo: string, lineas: Array<{ nombre: string; total: number }>) => (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {lineas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nada todavía.</p>
      ) : (
        lineas.map((l) => (
          <div key={l.nombre} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{l.nombre}</span>
            <span className="font-mono">{formatMoney(l.total)}</span>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-primary" />
        <h3 className="font-bold">Historial de mesas</h3>
        <span className="ml-auto">
          <Button variant="ghost" size="icon" onClick={imprimir} aria-label="Imprimir historial de mesas">
            <Printer className="h-4 w-4" />
          </Button>
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <Card className="lg:col-span-2">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Día</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-right">Entró</TableHead>
                  <TableHead className="text-right">Salió</TableHead>
                  <TableHead className="text-right">Queda</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((m) => (
                  <TableRow
                    key={m.id}
                    onClick={() => onVerDia(m.fecha)}
                    className={`cursor-pointer ${m.fecha === fechaActual ? 'bg-accent/60' : ''}`}
                    title="Ver la mesa de este día"
                  >
                    <TableCell className="font-semibold whitespace-nowrap">{formatFecha(m.fecha)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={m.estado === 'cerrada' ? 'secondary' : 'success'} className="text-[10px]">
                        {m.estado === 'cerrada' ? 'Cerrada' : 'Abierta'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-emerald-700 dark:text-emerald-400">
                      {formatMoney(m.totalIngresos)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-destructive">
                      {formatMoney(m.totalEgresos)}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-bold ${m.saldo < 0 ? 'text-destructive' : ''}`}>
                      {formatMoney(m.saldo)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {puedeEscribir && m.estado === 'cerrada' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Reabrir esta mesa para corregirla"
                          onClick={(e) => {
                            // Abre la mesa Y salta a ese día, para poder
                            // corregirla de una sin ir arriba a reabrirla.
                            e.stopPropagation();
                            onCorregir(m.id, m.fecha);
                          }}
                        >
                          <Unlock className="h-3.5 w-3.5 mr-1" />
                          Corregir
                        </Button>
                      )}
                      {puedeEscribir && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Borrar este día del historial"
                              aria-label={`Borrar la mesa del ${formatFecha(m.fecha)}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                ¿Borrar la mesa del {formatFecha(m.fecha)}?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Se borra el día completo:{' '}
                                <span className="font-semibold text-destructive">
                                  los {formatMoney(m.totalIngresos)} que entraron y los{' '}
                                  {formatMoney(m.totalEgresos)} que salieron
                                </span>{' '}
                                desaparecen también de Recibos y de Egresos, como si ese día nunca se
                                hubiera cuadrado. Esto no se puede deshacer.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onBorrar(m)}>
                                Borrar el día completo
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 bg-muted/40">
                  <TableCell colSpan={2} className="font-bold">Total del torneo</TableCell>
                  <TableCell className="text-right font-mono font-bold">{formatMoney(totales.ingresos)}</TableCell>
                  <TableCell className="text-right font-mono font-bold">{formatMoney(totales.egresos)}</TableCell>
                  <TableCell
                    className={`text-right font-mono font-black ${totales.saldo < 0 ? 'text-destructive' : 'text-primary'}`}
                  >
                    {formatMoney(totales.saldo)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <h4 className="font-bold text-sm">En qué se va la plata</h4>
              <p className="text-xs text-muted-foreground">Sumando todos los días del torneo</p>
            </div>
            {bloqueResumen('Entró por', resumen?.ingresos ?? [])}
            {bloqueResumen('Salió en', resumen?.egresos ?? [])}
          </CardContent>
        </Card>
      </div>

      <ImprimirPortal activo={imprimiendo}>
        <TablaImprimible
          titulo="HISTORIAL DE MESAS"
          columnas={[
            { encabezado: 'Día' },
            { encabezado: 'Entró', alineacion: 'derecha' },
            { encabezado: 'Salió', alineacion: 'derecha' },
            { encabezado: 'Queda', alineacion: 'derecha' },
          ]}
          filas={[
            ...filas.map((m) => ({
              clave: m.id,
              celdas: [
                formatFecha(m.fecha),
                formatMoney(m.totalIngresos),
                formatMoney(m.totalEgresos),
                formatMoney(m.saldo),
              ],
            })),
            {
              clave: 'total',
              destacada: true,
              celdas: [
                'Total del torneo',
                formatMoney(totales.ingresos),
                formatMoney(totales.egresos),
                formatMoney(totales.saldo),
              ],
            },
          ]}
          nota={
            (resumen?.egresos ?? []).length > 0
              ? `Salió en: ${(resumen?.egresos ?? []).map((l) => `${l.nombre} ${formatMoney(l.total)}`).join(' · ')}`
              : undefined
          }
        />
      </ImprimirPortal>
    </div>
  );
}
