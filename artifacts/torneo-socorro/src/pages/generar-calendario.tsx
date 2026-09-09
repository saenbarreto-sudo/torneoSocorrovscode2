import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetEquipos,
  useGetPartidos,
  useCreatePartidosLote,
  useCreateSemanaFecha,
  getGetPartidosQueryKey,
  getGetProgramacionQueryKey,
} from '@workspace/api-client-react';
import { useAuth, canWrite } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, CalendarPlus, Info, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { extractErrorMessage } from '@/lib/api-errors';
import { generarFixture, type EquipoFixture, type JornadaFixture, type PartidoFixture } from '@/lib/fixture';

export default function GenerarCalendario() {
  const [, navigate] = useLocation();
  const { role } = useAuth();
  const puedeProgramar = canWrite(role, 'partidos');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: equipos } = useGetEquipos();
  const { data: partidosExistentes } = useGetPartidos();
  const crearLote = useCreatePartidosLote();
  const crearProgramacion = useCreateSemanaFecha();

  const hoyISO = () => new Date().toISOString().slice(0, 10);

  // ── Paso 1: equipos que participan ────────────────────────────────────────
  // Se arranca con los equipos activos, que es lo que pidió el torneo: el
  // calendario del año se arma con los que están inscritos esta temporada.
  const [seleccionInicializada, setSeleccionInicializada] = useState(false);
  const [equiposElegidos, setEquiposElegidos] = useState<Set<number>>(new Set());

  if (equipos && !seleccionInicializada) {
    setEquiposElegidos(new Set(equipos.filter((e) => e.activo).map((e) => e.id)));
    setSeleccionInicializada(true);
  }

  // ── Paso 2: opciones ──────────────────────────────────────────────────────
  const [idaYVuelta, setIdaYVuelta] = useState(true);
  const [semanaInicial, setSemanaInicial] = useState('');
  // Arranca en hoy (no vacío): si el usuario no la toca, cada partido igual
  // sale con una fecha real de entrada en vez de quedar en blanco — antes
  // dejar este campo vacío dejaba TODOS los partidos sin fecha.
  const [fechaInicial, setFechaInicial] = useState(hoyISO());
  const [diasEntreJornadas, setDiasEntreJornadas] = useState('7');
  const [hora, setHora] = useState('');

  // Por defecto se continúa después de la última semana ya programada, para no
  // pisar partidos que ya existen.
  const semanaSugerida = useMemo(() => {
    const maxima = (partidosExistentes ?? []).reduce((max, p) => Math.max(max, p.semana), 0);
    return maxima + 1;
  }, [partidosExistentes]);

  const semanaInicialNum = semanaInicial === '' ? semanaSugerida : Number(semanaInicial);
  const diasNum = Number(diasEntreJornadas) || 7;

  // ── Calendario propuesto ──────────────────────────────────────────────────
  const jornadas: JornadaFixture[] = useMemo(() => {
    if (!equipos) return [];
    const participantes: EquipoFixture[] = equipos
      .filter((e) => equiposElegidos.has(e.id))
      .map((e) => ({ id: e.id, nombre: e.nombre }));
    if (participantes.length < 2) return [];
    return generarFixture({
      equipos: participantes,
      idaYVuelta,
      semanaInicial: semanaInicialNum,
      fechaInicial: fechaInicial || null,
      diasEntreJornadas: diasNum,
    });
  }, [equipos, equiposElegidos, idaYVuelta, semanaInicialNum, fechaInicial, diasNum]);

  // Cruces que ya están programados, con el mismo local y el mismo visitante.
  const yaProgramados = useMemo(() => {
    return new Set((partidosExistentes ?? []).map((p) => `${p.localId}x${p.visitanteId}`));
  }, [partidosExistentes]);

  const estaProgramado = (localId: number, visitanteId: number) =>
    yaProgramados.has(`${localId}x${visitanteId}`);

  // ── Paso 3: qué partidos se van a guardar ─────────────────────────────────
  // Arranca vacío a propósito: el usuario elige qué programa, no al revés.
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());

  // Fecha elegida a mano para un partido puntual, cuando no coincide con la
  // fecha de toda la jornada (ej. la jornada cae sábado y domingo a la vez).
  // Solo guarda los que el usuario tocó — el resto sigue usando la fecha por
  // defecto de su jornada.
  const [fechasPorClave, setFechasPorClave] = useState<Map<string, string>>(new Map());

  const alternarPartido = (clave: string) => {
    setElegidos((previo) => {
      const copia = new Set(previo);
      if (copia.has(clave)) copia.delete(clave);
      else copia.add(clave);
      return copia;
    });
  };

  /** Marca o desmarca de golpe un grupo de partidos (todos, o solo los que pasan la búsqueda). */
  const marcarPartidos = (grupo: PartidoFixture[], marcar: boolean) => {
    setElegidos((previo) => {
      const copia = new Set(previo);
      for (const p of grupo) {
        if (estaProgramado(p.local.id, p.visitante.id)) continue;
        if (marcar) copia.add(p.clave);
        else copia.delete(p.clave);
      }
      return copia;
    });
  };

  const partidosPorClave = useMemo(() => {
    const mapa = new Map<string, (typeof jornadas)[number]['partidos'][number]>();
    for (const j of jornadas) for (const p of j.partidos) mapa.set(p.clave, p);
    return mapa;
  }, [jornadas]);

  // ── Lista plana, sin agrupar por jornada: el orden en que las genera
  // generarFixture ya es cronológico (la fecha de cada jornada solo avanza),
  // así que alcanza con aplanarlo tal cual.
  const partidosPlanos: PartidoFixture[] = useMemo(
    () => jornadas.flatMap((j) => j.partidos),
    [jornadas],
  );

  const [busqueda, setBusqueda] = useState('');
  const partidosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return partidosPlanos;
    return partidosPlanos.filter(
      (p) => p.local.nombre.toLowerCase().includes(texto) || p.visitante.nombre.toLowerCase().includes(texto),
    );
  }, [partidosPlanos, busqueda]);

  // Fecha para aplicar de una sola vez a los partidos que pasan la búsqueda
  // actual — el flujo real es "busco un equipo puntual, les pongo la misma
  // fecha a todos los que aparecieron", en vez de llenar uno por uno.
  const [fechaParaVisibles, setFechaParaVisibles] = useState(hoyISO());
  const aplicarFechaAVisibles = () => {
    if (!fechaParaVisibles) return;
    setFechasPorClave((previo) => {
      const copia = new Map(previo);
      for (const p of partidosFiltrados) copia.set(p.clave, fechaParaVisibles);
      return copia;
    });
  };

  // Nombre de la Programación que se crea al guardar este lote (opcional:
  // si se deja vacío, se arma uno automático con el rango de fechas).
  const [nombreProgramacion, setNombreProgramacion] = useState('');

  // Si cambian los equipos o las opciones, el calendario se rehace y las claves
  // viejas dejan de existir: solo cuentan las que siguen estando.
  const clavesVigentes = useMemo(
    () => [...elegidos].filter((c) => partidosPorClave.has(c)),
    [elegidos, partidosPorClave],
  );

  const totalPartidos = jornadas.reduce((a, j) => a + j.partidos.length, 0);
  const jornadasPorVuelta = idaYVuelta ? jornadas.length / 2 : jornadas.length;

  const guardar = async () => {
    const aCrear = clavesVigentes
      .map((c) => partidosPorClave.get(c)!)
      .sort((a, b) => a.semana - b.semana)
      .map((p) => {
        // La fecha que el usuario haya elegido a mano para ESTE partido
        // manda sobre la fecha por defecto de toda la jornada — así una
        // misma semana puede quedar con partidos sábado y otros domingo.
        const fecha = fechasPorClave.get(p.clave) ?? p.fecha;
        return {
          semana: p.semana,
          localId: p.local.id,
          visitanteId: p.visitante.id,
          ...(fecha ? { fecha } : {}),
          ...(hora ? { hora } : {}),
          fase: p.vuelta === 1 ? 'Primera vuelta' : 'Segunda vuelta',
        };
      });

    if (aCrear.length === 0) return;

    try {
      const resultado = await crearLote.mutateAsync({ data: { partidos: aCrear } });
      await queryClient.invalidateQueries({ queryKey: getGetPartidosQueryKey() });

      // Una sola Programación por cada guardado, cubriendo el rango de
      // fechas de lo que se acaba de guardar — sin importar cuántos
      // números de semana distintos tenga. Si nada de lo guardado tiene
      // fecha, no tiene sentido un rango: se omite.
      const fechas = aCrear.map((p) => p.fecha).filter((f): f is string => !!f).sort();
      let programacionCreada = false;
      if (fechas.length > 0) {
        const fechaDesde = fechas[0];
        const fechaHasta = fechas[fechas.length - 1];
        const semanas = aCrear.map((p) => p.semana);
        const semanaMin = Math.min(...semanas);
        const nombre =
          nombreProgramacion.trim() ||
          (fechaDesde === fechaHasta ? `Semana ${semanaMin}` : `Semana ${semanaMin} y siguientes`);
        try {
          await crearProgramacion.mutateAsync({
            data: { semana: semanaMin, nombreSemana: nombre, fechaDesde, fechaHasta },
          });
          await queryClient.invalidateQueries({ queryKey: getGetProgramacionQueryKey() });
          programacionCreada = true;
        } catch (errorProgramacion) {
          // Los partidos ya se guardaron; que falle la Programación (poco
          // probable) no debería hacer parecer que se perdió todo el lote.
          toast({
            title: 'Los partidos se guardaron, pero no se pudo crear la Programación',
            description: extractErrorMessage(errorProgramacion),
            variant: 'destructive',
          });
        }
      }

      setElegidos(new Set());
      setFechasPorClave(new Map());
      setNombreProgramacion('');

      const detalles = [
        `${resultado.creados} ${resultado.creados === 1 ? 'partido programado' : 'partidos programados'}`,
        resultado.omitidos > 0 ? `${resultado.omitidos} ya existían y se omitieron` : null,
        programacionCreada ? 'Programación creada' : null,
      ].filter(Boolean);

      toast({ title: 'Calendario guardado', description: detalles.join(' · ') });
      navigate('/programacion');
    } catch (error) {
      toast({
        title: 'No se pudo guardar el calendario',
        description: extractErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  if (!puedeProgramar) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No tienes permiso para programar partidos.
        <div className="mt-4">
          <Button variant="outline" onClick={() => navigate('/programacion')}>Volver</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-28">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/programacion')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Generar calendario</h1>
          <p className="text-muted-foreground mt-1">
            Arma todos los cruces del torneo y elige cuáles vas a programar
          </p>
        </div>
      </div>

      {/* ── 1. Equipos ── */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-sm font-bold">1. Equipos que participan</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {equiposElegidos.size} de {equipos?.length ?? 0} equipos marcados
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEquiposElegidos(new Set((equipos ?? []).filter((e) => e.activo).map((e) => e.id)))}
              >
                Solo activos
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEquiposElegidos(new Set((equipos ?? []).map((e) => e.id)))}>
                Todos
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEquiposElegidos(new Set())}>
                Ninguno
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
            {equipos?.map((equipo) => (
              <label
                key={equipo.id}
                className="flex items-center gap-2 text-sm cursor-pointer py-1 hover:text-primary"
              >
                <Checkbox
                  checked={equiposElegidos.has(equipo.id)}
                  onCheckedChange={() =>
                    setEquiposElegidos((previo) => {
                      const copia = new Set(previo);
                      if (copia.has(equipo.id)) copia.delete(equipo.id);
                      else copia.add(equipo.id);
                      return copia;
                    })
                  }
                />
                <span className={equipo.activo ? '' : 'text-muted-foreground'}>
                  {equipo.nombre}
                  {!equipo.activo && <span className="text-xs"> (inactivo)</span>}
                </span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── 2. Opciones ── */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <h2 className="text-sm font-bold">2. Opciones del calendario</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5 lg:col-span-2">
              <Label>Vueltas</Label>
              <Select value={idaYVuelta ? 'ida-vuelta' : 'solo-ida'} onValueChange={(v) => setIdaYVuelta(v === 'ida-vuelta')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ida-vuelta">Ida y vuelta</SelectItem>
                  <SelectItem value="solo-ida">Solo primera vuelta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Semana inicial</Label>
              <Input
                type="number"
                min={1}
                value={semanaInicial}
                placeholder={String(semanaSugerida)}
                onChange={(e) => setSemanaInicial(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Fecha de la 1.ª jornada</Label>
              <Input type="date" value={fechaInicial} onChange={(e) => setFechaInicial(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Días entre jornadas</Label>
              <Input
                type="number"
                min={1}
                value={diasEntreJornadas}
                onChange={(e) => setDiasEntreJornadas(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <Label>Hora (opcional)</Label>
              <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>

          {jornadas.length > 0 && (
            <div className="flex items-start gap-2 text-sm bg-muted/50 rounded-md p-3">
              <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <span className="font-semibold">
                  {equiposElegidos.size} equipos → {jornadasPorVuelta} jornadas por vuelta,{' '}
                  {jornadas.length} en total, {totalPartidos} partidos.
                </span>
                {equiposElegidos.size % 2 !== 0 && (
                  <span className="text-muted-foreground">
                    {' '}Como el número de equipos es impar, en cada jornada descansa uno.
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 3. Elegir partidos ── */}
      <Card>
        <CardContent className="p-0">
          <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-sm font-bold">3. Elige los partidos que vas a programar</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Busca por equipo (local o visitante) para encontrar un cruce puntual. Nada se guarda hasta que confirmes.
              </p>
            </div>
            {jornadas.length > 0 && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => marcarPartidos(partidosPlanos, true)}>
                  Marcar todo
                </Button>
                <Button variant="outline" size="sm" onClick={() => setElegidos(new Set())}>
                  Limpiar
                </Button>
              </div>
            )}
          </div>

          {jornadas.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              Marca al menos dos equipos para armar el calendario.
            </div>
          ) : (
            <>
              <div className="px-6 py-3 border-b flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-55">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Buscar por equipo local o visitante..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                  />
                </div>
                {busqueda.trim() && (
                  <>
                    <span className="text-xs text-muted-foreground">
                      {partidosFiltrados.length} de {partidosPlanos.length} partidos
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => marcarPartidos(partidosFiltrados, true)}>
                      Marcar estos
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => marcarPartidos(partidosFiltrados, false)}>
                      Desmarcar estos
                    </Button>
                  </>
                )}
              </div>

              {busqueda.trim() && partidosFiltrados.length > 0 && (
                <div className="px-6 py-2 border-b bg-muted/30 flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-muted-foreground">Ponerle esta fecha a los {partidosFiltrados.length} de arriba:</span>
                  <Input
                    type="date"
                    className="h-8 w-37.5 text-xs"
                    value={fechaParaVisibles}
                    onChange={(e) => setFechaParaVisibles(e.target.value)}
                  />
                  <Button variant="outline" size="sm" className="h-8" onClick={aplicarFechaAVisibles}>
                    Aplicar a los visibles
                  </Button>
                </div>
              )}

              <div className="divide-y max-h-150 overflow-y-auto">
                {partidosFiltrados.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground text-sm">
                    Ningún partido coincide con "{busqueda}".
                  </div>
                ) : (
                  partidosFiltrados.map((p) => {
                    const programado = estaProgramado(p.local.id, p.visitante.id);
                    return (
                      <label
                        key={p.clave}
                        className={`flex items-center gap-3 px-6 py-2 text-sm ${
                          programado ? 'opacity-60' : 'cursor-pointer hover:bg-muted/50'
                        }`}
                      >
                        <Checkbox
                          disabled={programado}
                          checked={elegidos.has(p.clave)}
                          onCheckedChange={() => alternarPartido(p.clave)}
                        />
                        <span className="text-xs text-muted-foreground font-mono w-28 shrink-0">
                          Sem {p.semana} · V{p.vuelta}
                        </span>
                        <span className="flex-1">
                          <span className="font-semibold">{p.local.nombre}</span>
                          <span className="text-muted-foreground"> vs </span>
                          <span className="font-semibold">{p.visitante.nombre}</span>
                        </span>
                        {!programado && (
                          // stopPropagation: la fila entera es un <label> que activa el
                          // checkbox al hacer clic — sin esto, cambiar la fecha también
                          // marcaría/desmarcaría el partido por accidente.
                          <span onClick={(e) => e.stopPropagation()} className="shrink-0">
                            <Input
                              type="date"
                              className="h-8 w-37.5 text-xs"
                              value={fechasPorClave.get(p.clave) ?? p.fecha ?? ''}
                              onChange={(e) => {
                                const valor = e.target.value;
                                setFechasPorClave((previo) => {
                                  const copia = new Map(previo);
                                  if (valor) copia.set(p.clave, valor);
                                  else copia.delete(p.clave);
                                  return copia;
                                });
                              }}
                            />
                          </span>
                        )}
                        {programado && <Badge variant="secondary">ya programado</Badge>}
                      </label>
                    );
                  })
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Barra fija de confirmación: siempre visible mientras se eligen partidos. */}
      {clavesVigentes.length > 0 && (
        // md:left-64 deja libre la barra lateral, que mide w-64 en el layout.
        <div className="fixed bottom-0 left-0 md:left-64 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-20">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm">
              <span className="font-bold">{clavesVigentes.length}</span> partido
              {clavesVigentes.length === 1 ? '' : 's'} seleccionado
              {clavesVigentes.length === 1 ? '' : 's'}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                className="h-9 w-56"
                placeholder="Nombre de esta programación (opcional)"
                value={nombreProgramacion}
                onChange={(e) => setNombreProgramacion(e.target.value)}
              />
              <Button onClick={guardar} disabled={crearLote.isPending}>
                <CalendarPlus className="h-4 w-4 mr-2" />
                {crearLote.isPending ? 'Guardando...' : `Programar ${clavesVigentes.length}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
