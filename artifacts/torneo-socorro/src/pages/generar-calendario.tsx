import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetEquipos,
  useGetPartidos,
  useCreatePartidosLote,
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ArrowLeft, CalendarPlus, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { extractErrorMessage } from '@/lib/api-errors';
import { generarFixture, type EquipoFixture, type JornadaFixture } from '@/lib/fixture';

function formatFechaCorta(fecha: string | null): string {
  if (!fecha) return '';
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

export default function GenerarCalendario() {
  const [, navigate] = useLocation();
  const { role } = useAuth();
  const puedeProgramar = canWrite(role, 'partidos');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: equipos } = useGetEquipos();
  const { data: partidosExistentes } = useGetPartidos();
  const crearLote = useCreatePartidosLote();

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
  const [fechaInicial, setFechaInicial] = useState('');
  const [diasEntreJornadas, setDiasEntreJornadas] = useState('7');
  const [hora, setHora] = useState('');
  const [crearSemanas, setCrearSemanas] = useState(true);

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

  const alternarPartido = (clave: string) => {
    setElegidos((previo) => {
      const copia = new Set(previo);
      if (copia.has(clave)) copia.delete(clave);
      else copia.add(clave);
      return copia;
    });
  };

  /** Marca o desmarca de golpe un grupo de jornadas (una, o toda una vuelta). */
  const marcarJornadas = (grupo: JornadaFixture[], marcar: boolean) => {
    setElegidos((previo) => {
      const copia = new Set(previo);
      for (const j of grupo) {
        for (const p of j.partidos) {
          if (estaProgramado(p.local.id, p.visitante.id)) continue;
          if (marcar) copia.add(p.clave);
          else copia.delete(p.clave);
        }
      }
      return copia;
    });
  };

  const partidosPorClave = useMemo(() => {
    const mapa = new Map<string, (typeof jornadas)[number]['partidos'][number]>();
    for (const j of jornadas) for (const p of j.partidos) mapa.set(p.clave, p);
    return mapa;
  }, [jornadas]);

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
      .map((p) => ({
        semana: p.semana,
        localId: p.local.id,
        visitanteId: p.visitante.id,
        ...(p.fecha ? { fecha: p.fecha } : {}),
        ...(hora ? { hora } : {}),
        fase: p.vuelta === 1 ? 'Primera vuelta' : 'Segunda vuelta',
      }));

    if (aCrear.length === 0) return;

    try {
      const resultado = await crearLote.mutateAsync({ data: { partidos: aCrear, crearSemanas } });
      await queryClient.invalidateQueries({ queryKey: getGetPartidosQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetProgramacionQueryKey() });
      setElegidos(new Set());

      const detalles = [
        `${resultado.creados} ${resultado.creados === 1 ? 'partido programado' : 'partidos programados'}`,
        resultado.semanasCreadas > 0 ? `${resultado.semanasCreadas} semanas creadas en el cronograma` : null,
        resultado.omitidos > 0 ? `${resultado.omitidos} ya existían y se omitieron` : null,
      ].filter(Boolean);

      toast({ title: 'Calendario guardado', description: detalles.join(' · ') });
      navigate('/partidos');
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

  const vueltas: Array<{ numero: 1 | 2; titulo: string; jornadas: JornadaFixture[] }> = [
    { numero: 1, titulo: 'Primera vuelta', jornadas: jornadas.filter((j) => j.vuelta === 1) },
    ...(idaYVuelta
      ? [{ numero: 2 as const, titulo: 'Segunda vuelta', jornadas: jornadas.filter((j) => j.vuelta === 2) }]
      : []),
  ];

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
            <div className="flex items-end lg:col-span-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
                <Checkbox checked={crearSemanas} onCheckedChange={(v) => setCrearSemanas(v === true)} />
                Crear también las semanas en el cronograma
              </label>
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
                Abre una jornada para ver sus partidos. Nada se guarda hasta que confirmes.
              </p>
            </div>
            {jornadas.length > 0 && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => marcarJornadas(jornadas, true)}>
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
            <div className="divide-y">
              {vueltas.map((vuelta) => {
                const disponibles = vuelta.jornadas.flatMap((j) =>
                  j.partidos.filter((p) => !estaProgramado(p.local.id, p.visitante.id)),
                );
                const marcadosVuelta = disponibles.filter((p) => elegidos.has(p.clave)).length;

                return (
                  <div key={vuelta.numero}>
                    <div className="px-6 py-3 bg-muted/40 flex items-center justify-between gap-4 flex-wrap">
                      <div className="font-bold text-sm">
                        {vuelta.titulo}
                        <span className="font-normal text-muted-foreground">
                          {' · '}
                          {marcadosVuelta} de {disponibles.length} marcados
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => marcarJornadas(vuelta.jornadas, true)}>
                          Marcar la vuelta
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => marcarJornadas(vuelta.jornadas, false)}>
                          Desmarcar
                        </Button>
                      </div>
                    </div>

                    <Accordion type="multiple">
                      {vuelta.jornadas.map((j) => {
                        const disponiblesJornada = j.partidos.filter(
                          (p) => !estaProgramado(p.local.id, p.visitante.id),
                        );
                        const marcados = disponiblesJornada.filter((p) => elegidos.has(p.clave)).length;

                        return (
                          <AccordionItem key={`v${j.vuelta}-j${j.jornada}`} value={`v${j.vuelta}-j${j.jornada}`}>
                            <AccordionTrigger className="px-6 hover:no-underline">
                              <div className="flex items-center gap-3 flex-wrap text-left">
                                <span className="font-bold">Jornada {j.jornada}</span>
                                <span className="text-xs text-muted-foreground font-mono">
                                  semana {j.semana}
                                  {j.fecha && ` · ${formatFechaCorta(j.fecha)}`}
                                </span>
                                {marcados > 0 && (
                                  <Badge variant="success">
                                    {marcados} marcado{marcados === 1 ? '' : 's'}
                                  </Badge>
                                )}
                                {disponiblesJornada.length === 0 && (
                                  <Badge variant="secondary">ya programada</Badge>
                                )}
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-6 pb-4">
                              <div className="flex gap-2 mb-3">
                                <Button variant="outline" size="sm" onClick={() => marcarJornadas([j], true)}>
                                  Marcar la jornada
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => marcarJornadas([j], false)}>
                                  Desmarcar
                                </Button>
                              </div>

                              {j.descansa && (
                                <p className="text-xs text-muted-foreground mb-3">
                                  Descansa: <span className="font-semibold">{j.descansa.nombre}</span>
                                </p>
                              )}

                              <div className="space-y-1">
                                {j.partidos.map((p) => {
                                  const programado = estaProgramado(p.local.id, p.visitante.id);
                                  return (
                                    <label
                                      key={p.clave}
                                      className={`flex items-center gap-3 py-1.5 text-sm rounded-md ${
                                        programado ? 'opacity-60' : 'cursor-pointer hover:bg-muted/50'
                                      }`}
                                    >
                                      <Checkbox
                                        className="ml-1"
                                        disabled={programado}
                                        checked={elegidos.has(p.clave)}
                                        onCheckedChange={() => alternarPartido(p.clave)}
                                      />
                                      <span className="flex-1">
                                        <span className="font-semibold">{p.local.nombre}</span>
                                        <span className="text-muted-foreground"> vs </span>
                                        <span className="font-semibold">{p.visitante.nombre}</span>
                                      </span>
                                      {programado && <Badge variant="secondary">ya programado</Badge>}
                                    </label>
                                  );
                                })}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  </div>
                );
              })}
            </div>
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
            <Button onClick={guardar} disabled={crearLote.isPending}>
              <CalendarPlus className="h-4 w-4 mr-2" />
              {crearLote.isPending ? 'Guardando...' : `Programar ${clavesVigentes.length}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
