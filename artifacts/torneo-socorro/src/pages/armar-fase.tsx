import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useQueries } from '@tanstack/react-query';
import {
  useGetFases,
  useGetPartidos,
  useCreatePartidosLote,
  useCreateSemanaFecha,
  useCreateFasesLote,
  getGetPartidosQueryKey,
  getGetProgramacionQueryKey,
  getGetFasesQueryKey,
  getGetPosicionesQueryOptions,
} from '@workspace/api-client-react';
import { useAuth, canWrite } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Info, Trophy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { extractErrorMessage } from '@/lib/api-errors';
import { generarFixture, sumarDias, type EquipoFixture } from '@/lib/fixture';
import { generarLlaves, nombreFaseEliminacion, type EquipoSembrado } from '@/lib/llaves';
import { repartirEnGrupos, letraGrupo, combinarClasificadosDeVariosOrigenes, origenDeEquipo } from '@/lib/grupos';

/** Valor especial para "de dónde salen los clasificados": la tabla general (primera + segunda vuelta). */
const TABLA_GENERAL = '__general__';

interface PartidoGenerado {
  clave: string;
  local: EquipoFixture;
  visitante: EquipoFixture;
  semana: number;
  fecha: string | null;
  fase: string;
}

type Formato = 'liguilla' | 'grupos' | 'eliminacion';

export default function ArmarFase() {
  const [, navigate] = useLocation();
  const { role } = useAuth();
  const puedeProgramar = canWrite(role, 'partidos');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const hoyISO = () => new Date().toISOString().slice(0, 10);

  // ── Paso 1: de dónde salen los clasificados (uno o varios orígenes) ──────
  const { data: fasesExtra } = useGetFases();
  const [origenesSeleccionados, setOrigenesSeleccionados] = useState<Set<string>>(new Set([TABLA_GENERAL]));
  const origenesArray = useMemo(() => [...origenesSeleccionados], [origenesSeleccionados]);

  const resultadosPosiciones = useQueries({
    queries: origenesArray.map((origen) => getGetPosicionesQueryOptions(origen === TABLA_GENERAL ? undefined : { fase: origen })),
  });
  const cargandoTablas = resultadosPosiciones.some((r) => r.isLoading);

  // /posiciones ya filtra por su cuenta: para la Tabla general trae a todos
  // los equipos activos (tiene sentido, ahí interesa ver a todo el mundo),
  // pero al pedir una fase puntual (un grupo, una liguilla...) solo trae a
  // los equipos que de verdad están en esa fase.
  const tablaVisible = (_origen: string, i: number) => resultadosPosiciones[i]?.data ?? [];

  const alternarOrigen = (origen: string) => {
    setOrigenesSeleccionados((previo) => {
      const copia = new Set(previo);
      if (copia.has(origen)) copia.delete(origen);
      else copia.add(origen);
      return copia;
    });
  };

  // ── Paso 2: cuántos clasifican de cada origen, con la lista editable ─────
  const [cantidadClasifican, setCantidadClasifican] = useState('4');
  const cantidadNum = Math.max(0, Number(cantidadClasifican) || 0);

  const claveSeleccion = `${origenesArray.join(',')}|${cantidadNum}`;
  const [seleccionInicializadaPara, setSeleccionInicializadaPara] = useState<string | null>(null);
  const [equiposElegidos, setEquiposElegidos] = useState<Set<number>>(new Set());

  if (!cargandoTablas && seleccionInicializadaPara !== claveSeleccion) {
    const nuevaSeleccion = new Set<number>();
    origenesArray.forEach((origen, i) => {
      for (const p of tablaVisible(origen, i)) {
        if (p.posicion <= cantidadNum) nuevaSeleccion.add(p.equipoId);
      }
    });
    setEquiposElegidos(nuevaSeleccion);
    setSeleccionInicializadaPara(claveSeleccion);
  }

  // Cada equipo marcado se atribuye al PRIMER origen (en el orden elegido)
  // donde aparece, para que no se cuente dos veces si por casualidad
  // aparece en más de una tabla a la vez.
  const origenesConEquipos = useMemo(() => {
    const usados = new Set<number>();
    return origenesArray.map((origen, i) => {
      const tabla = tablaVisible(origen, i);
      const equipos: EquipoSembrado[] = [];
      for (const p of tabla) {
        if (!equiposElegidos.has(p.equipoId) || usados.has(p.equipoId)) continue;
        usados.add(p.equipoId);
        equipos.push({ id: p.equipoId, nombre: p.equipoNombre, posicion: p.posicion });
      }
      return { fase: origen, equipos: equipos.sort((a, b) => a.posicion - b.posicion) };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });
  }, [origenesArray, equiposElegidos, resultadosPosiciones.map((r) => r.data).join('|')]);

  const equiposClasificados: EquipoSembrado[] = useMemo(() => {
    if (origenesConEquipos.length <= 1) return origenesConEquipos[0]?.equipos ?? [];
    return combinarClasificadosDeVariosOrigenes(origenesConEquipos);
  }, [origenesConEquipos]);

  // ── Paso 3: formato de esta fase ───────────────────────────────────────────
  const [formato, setFormato] = useState<Formato>('liguilla');
  const [idaYVuelta, setIdaYVuelta] = useState(false);
  const [cantidadGrupos, setCantidadGrupos] = useState('2');
  const cantidadGruposNum = Math.max(1, Number(cantidadGrupos) || 1);
  const [prefijoGrupo, setPrefijoGrupo] = useState('Grupo');

  const nombreSugerido =
    formato === 'liguilla' ? 'Liguilla' : formato === 'grupos' ? 'Fase de grupos' : nombreFaseEliminacion(equiposClasificados.length);
  const [nombreFase, setNombreFase] = useState(nombreSugerido);
  const [nombreEditadoAMano, setNombreEditadoAMano] = useState(false);
  const nombreFaseActual = nombreEditadoAMano ? nombreFase : nombreSugerido;

  const { data: partidosExistentes } = useGetPartidos();

  /**
   * Repechajes que todavía no se han jugado.
   *
   * El repechaje define cuál es el último equipo que entra a la siguiente
   * ronda, así que mientras no se juegue las tablas de arriba no están
   * cerradas: armar los cruces ahora puede sembrar al equipo equivocado.
   * No se bloquea — a veces hace falta dejar el calendario listo de una —
   * pero sí se avisa antes de guardar.
   */
  const repechajesPendientes = useMemo(
    () => (partidosExistentes ?? []).filter((p) => /repechaje/i.test(p.fase ?? '') && !p.jugado),
    [partidosExistentes],
  );

  const semanaSugerida = useMemo(() => {
    const maxima = (partidosExistentes ?? []).reduce((max, p) => Math.max(max, p.semana), 0);
    return maxima + 1;
  }, [partidosExistentes]);
  const [semanaInicial, setSemanaInicial] = useState('');
  const semanaInicialNum = semanaInicial === '' ? semanaSugerida : Number(semanaInicial);
  const [fechaInicial, setFechaInicial] = useState(hoyISO());
  const [diasEntreJornadas, setDiasEntreJornadas] = useState('7');
  const diasNum = Number(diasEntreJornadas) || 7;

  // ── Grupos (solo para el formato "grupos") ────────────────────────────────
  const grupos = useMemo(
    () => (formato === 'grupos' ? repartirEnGrupos(equiposClasificados, cantidadGruposNum) : []),
    [formato, equiposClasificados, cantidadGruposNum],
  );

  // ── Partidos generados según el formato elegido ───────────────────────────
  const { partidos: partidosGenerados, equipoConBye } = useMemo((): {
    partidos: PartidoGenerado[];
    equipoConBye: EquipoSembrado | null;
  } => {
    if (equiposClasificados.length < 2) return { partidos: [], equipoConBye: null };

    if (formato === 'liguilla') {
      const jornadas = generarFixture({
        equipos: equiposClasificados,
        idaYVuelta,
        semanaInicial: semanaInicialNum,
        fechaInicial: fechaInicial || null,
        diasEntreJornadas: diasNum,
      });
      return {
        partidos: jornadas.flatMap((j) =>
          j.partidos.map((p) => ({ clave: p.clave, local: p.local, visitante: p.visitante, semana: p.semana, fecha: p.fecha, fase: nombreFaseActual })),
        ),
        equipoConBye: null,
      };
    }

    if (formato === 'grupos') {
      const partidos: PartidoGenerado[] = [];
      grupos.forEach((equiposGrupo, i) => {
        if (equiposGrupo.length < 2) return;
        const faseGrupo = `${prefijoGrupo.trim() || 'Grupo'} ${letraGrupo(i)}`;
        const jornadas = generarFixture({
          equipos: equiposGrupo,
          idaYVuelta,
          semanaInicial: semanaInicialNum,
          fechaInicial: fechaInicial || null,
          diasEntreJornadas: diasNum,
        });
        for (const j of jornadas) {
          for (const p of j.partidos) {
            partidos.push({ clave: `${faseGrupo}-${p.clave}`, local: p.local, visitante: p.visitante, semana: p.semana, fecha: p.fecha, fase: faseGrupo });
          }
        }
      });
      return { partidos, equipoConBye: null };
    }

    // Eliminación directa: un cruce por par sembrado, 1 o 2 partidos cada uno.
    const cruces = generarLlaves(equiposClasificados);
    const bye = cruces.find((c) => !c.peor)?.mejor ?? null;
    const partidos: PartidoGenerado[] = [];
    for (const cruce of cruces) {
      if (!cruce.peor) continue;
      if (idaYVuelta) {
        partidos.push({
          clave: `${cruce.clave}-ida`,
          local: cruce.peor,
          visitante: cruce.mejor,
          semana: semanaInicialNum,
          fecha: fechaInicial || null,
          fase: nombreFaseActual,
        });
        partidos.push({
          clave: `${cruce.clave}-vuelta`,
          local: cruce.mejor,
          visitante: cruce.peor,
          semana: semanaInicialNum + 1,
          fecha: fechaInicial ? sumarDias(fechaInicial, diasNum) : null,
          fase: nombreFaseActual,
        });
      } else {
        partidos.push({
          clave: cruce.clave,
          local: cruce.mejor,
          visitante: cruce.peor,
          semana: semanaInicialNum,
          fecha: fechaInicial || null,
          fase: nombreFaseActual,
        });
      }
    }
    return { partidos, equipoConBye: bye };
  }, [equiposClasificados, formato, idaYVuelta, semanaInicialNum, fechaInicial, diasNum, grupos, prefijoGrupo, nombreFaseActual]);

  // Cruces de la eliminación directa que enfrentan a dos equipos del mismo
  // origen (mismo grupo) — la combinación por niveles lo reduce, pero con
  // pocos orígenes o tamaños muy desparejos no siempre se puede evitar del
  // todo, así que se avisa en vez de ocultarlo.
  const crucesConChoque = useMemo(() => {
    if (formato !== 'eliminacion' || origenesConEquipos.length <= 1) return [];
    const vistos = new Set<string>();
    return partidosGenerados.filter((p) => {
      const clave = [p.local.id, p.visitante.id].sort().join('x');
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      const origenLocal = origenDeEquipo(p.local.id, origenesConEquipos);
      const origenVisitante = origenDeEquipo(p.visitante.id, origenesConEquipos);
      return origenLocal !== null && origenLocal === origenVisitante;
    });
  }, [formato, origenesConEquipos, partidosGenerados]);

  // ── Guardar ────────────────────────────────────────────────────────────────
  const crearLote = useCreatePartidosLote();
  const crearProgramacion = useCreateSemanaFecha();
  const crearFasesLote = useCreateFasesLote();
  const [nombreProgramacion, setNombreProgramacion] = useState('');

  const guardar = async () => {
    if (partidosGenerados.length === 0) return;
    const aCrear = partidosGenerados
      .sort((a, b) => a.semana - b.semana)
      .map((p) => ({
        semana: p.semana,
        localId: p.local.id,
        visitanteId: p.visitante.id,
        ...(p.fecha ? { fecha: p.fecha } : {}),
        fase: p.fase,
      }));

    // Registra el tipo de cada fase nueva (temporada_regular no aplica acá,
    // esas ya vienen sembradas) antes de crear los partidos — así Posiciones
    // ya sabe desde el primer momento si mostrarla como tabla o como llave,
    // y si cuenta para la valla menos vencida. Si una fase ya estaba
    // registrada, el backend simplemente la ignora.
    const nombresFase = [...new Set(aCrear.map((p) => p.fase))];
    try {
      await crearFasesLote.mutateAsync({
        data: { fases: nombresFase.map((nombre) => ({ nombre, tipo: formato })) },
      });
    } catch (error) {
      toast({ title: 'No se pudo registrar la fase', description: extractErrorMessage(error), variant: 'destructive' });
      return;
    }

    try {
      const resultado = await crearLote.mutateAsync({ data: { partidos: aCrear } });
      await queryClient.invalidateQueries({ queryKey: getGetPartidosQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetFasesQueryKey() });

      const fechas = aCrear.map((p) => p.fecha).filter((f): f is string => !!f).sort();
      let programacionCreada = false;
      if (fechas.length > 0) {
        const fechaDesde = fechas[0];
        const fechaHasta = fechas[fechas.length - 1];
        const semanaMin = Math.min(...aCrear.map((p) => p.semana));
        const nombre = nombreProgramacion.trim() || nombreFaseActual;
        try {
          await crearProgramacion.mutateAsync({
            data: { semana: semanaMin, nombreSemana: nombre, fechaDesde, fechaHasta },
          });
          await queryClient.invalidateQueries({ queryKey: getGetProgramacionQueryKey() });
          programacionCreada = true;
        } catch (errorProgramacion) {
          toast({
            title: 'Los partidos se guardaron, pero no se pudo crear la Programación',
            description: extractErrorMessage(errorProgramacion),
            variant: 'destructive',
          });
        }
      }

      const detalles = [
        `${resultado.creados} ${resultado.creados === 1 ? 'partido creado' : 'partidos creados'}`,
        resultado.omitidos > 0 ? `${resultado.omitidos} ya existían y se omitieron` : null,
        programacionCreada ? 'Programación creada' : null,
      ].filter(Boolean);
      toast({ title: `Fase "${nombreFaseActual}" guardada`, description: detalles.join(' · ') });
      navigate('/partidos');
    } catch (error) {
      toast({ title: 'No se pudo guardar la fase', description: extractErrorMessage(error), variant: 'destructive' });
    }
  };

  if (!puedeProgramar) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No tienes permiso para programar partidos.
        <div className="mt-4">
          <Button variant="outline" onClick={() => navigate('/partidos')}>Volver</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/partidos')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Armar fase</h1>
          <p className="text-muted-foreground mt-1">
            Elige quién clasifica, cómo se juega esta fase, y genera los partidos de una vez
          </p>
        </div>
      </div>

      {/* ── 1. Origen de los clasificados ── */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-sm font-bold">1. ¿Quién clasifica a esta fase?</h2>

          <div className="space-y-1.5">
            <Label>De dónde salen (marca uno o varios — por ejemplo, los grupos ya jugados)</Label>
            <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={origenesSeleccionados.has(TABLA_GENERAL)} onCheckedChange={() => alternarOrigen(TABLA_GENERAL)} />
                Tabla general
              </label>
              {fasesExtra?.map((f) => (
                <label key={f.nombre} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={origenesSeleccionados.has(f.nombre)} onCheckedChange={() => alternarOrigen(f.nombre)} />
                  {f.nombre}
                </label>
              ))}
            </div>
          </div>

          <div className="w-full sm:w-64 space-y-1.5">
            <Label>Cuántos clasifican de cada uno</Label>
            <Input
              type="number"
              min={1}
              value={cantidadClasifican}
              onChange={(e) => setCantidadClasifican(e.target.value)}
            />
          </div>

          {cargandoTablas ? (
            <p className="text-sm text-muted-foreground py-4">Cargando tablas...</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {origenesArray.map((origen, i) => (
                <div key={origen} className="border rounded-md overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2 text-xs font-bold uppercase tracking-wide">
                    {origen === TABLA_GENERAL ? 'Tabla general' : origen}
                  </div>
                  <div className="divide-y max-h-60 overflow-y-auto">
                    {tablaVisible(origen, i).map((pos) => (
                      <label
                        key={pos.equipoId}
                        className="flex items-center gap-3 px-4 py-1.5 text-sm cursor-pointer hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={equiposElegidos.has(pos.equipoId)}
                          onCheckedChange={() =>
                            setEquiposElegidos((previo) => {
                              const copia = new Set(previo);
                              if (copia.has(pos.equipoId)) copia.delete(pos.equipoId);
                              else copia.add(pos.equipoId);
                              return copia;
                            })
                          }
                        />
                        <span className="font-mono text-muted-foreground w-6 text-right">{pos.posicion}</span>
                        <span className="flex-1 font-semibold">{pos.equipoNombre}</span>
                        <span className="text-xs text-muted-foreground font-mono">{pos.pts} pts</span>
                      </label>
                    ))}
                    {tablaVisible(origen, i).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {origen === TABLA_GENERAL ? 'Sin equipos en esta tabla.' : 'Todavía no hay partidos en esta fase.'}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {equiposClasificados.length} equipos marcados en total. Se marcaron solos los primeros {cantidadNum} de
            cada tabla, pero puedes ajustar la lista a mano.
          </p>
        </CardContent>
      </Card>

      {/* ── 2. Formato ── */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <h2 className="text-sm font-bold">2. ¿Cómo se juega esta fase?</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => setFormato('liguilla')}
              className={`text-left rounded-lg border p-4 transition-colors ${
                formato === 'liguilla' ? 'border-primary bg-accent/60' : 'hover:bg-muted/50'
              }`}
            >
              <div className="font-bold text-sm">Liguilla (grupo único)</div>
              <p className="text-xs text-muted-foreground mt-1">
                Todos los clasificados juegan entre sí, como una mini temporada regular.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setFormato('grupos')}
              className={`text-left rounded-lg border p-4 transition-colors ${
                formato === 'grupos' ? 'border-primary bg-accent/60' : 'hover:bg-muted/50'
              }`}
            >
              <div className="font-bold text-sm">Fase de grupos</div>
              <p className="text-xs text-muted-foreground mt-1">
                Reparte a los clasificados en varios grupos parejos (por nivel) y cada uno juega todos contra todos dentro de su grupo.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setFormato('eliminacion')}
              className={`text-left rounded-lg border p-4 transition-colors ${
                formato === 'eliminacion' ? 'border-primary bg-accent/60' : 'hover:bg-muted/50'
              }`}
            >
              <div className="font-bold text-sm">Eliminación directa (llaves)</div>
              <p className="text-xs text-muted-foreground mt-1">
                Se emparejan por posición (1° vs último, 2° vs penúltimo...) y el que pierde queda eliminado.
              </p>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {formato === 'grupos' ? (
              <>
                <div className="space-y-1.5">
                  <Label>¿En cuántos grupos?</Label>
                  <Input type="number" min={2} value={cantidadGrupos} onChange={(e) => setCantidadGrupos(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Nombre de cada grupo</Label>
                  <Input value={prefijoGrupo} onChange={(e) => setPrefijoGrupo(e.target.value)} placeholder="Grupo" />
                </div>
              </>
            ) : (
              <div className="space-y-1.5 lg:col-span-2">
                <Label>Nombre de la fase</Label>
                <Input
                  value={nombreFaseActual}
                  onChange={(e) => {
                    setNombreFase(e.target.value);
                    setNombreEditadoAMano(true);
                  }}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{formato === 'eliminacion' ? 'Partidos por cruce' : 'Vueltas'}</Label>
              <Select value={idaYVuelta ? 'ida-vuelta' : 'solo-ida'} onValueChange={(v) => setIdaYVuelta(v === 'ida-vuelta')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="solo-ida">{formato === 'eliminacion' ? 'Partido único' : 'Solo ida'}</SelectItem>
                  <SelectItem value="ida-vuelta">Ida y vuelta</SelectItem>
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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Fecha del primer partido</Label>
              <Input type="date" value={fechaInicial} onChange={(e) => setFechaInicial(e.target.value)} />
            </div>
            {(formato !== 'eliminacion' || idaYVuelta) && (
              <div className="space-y-1.5">
                <Label>Días entre jornadas</Label>
                <Input
                  type="number"
                  min={1}
                  value={diasEntreJornadas}
                  onChange={(e) => setDiasEntreJornadas(e.target.value)}
                />
              </div>
            )}
          </div>

          {formato === 'grupos' && grupos.length > 0 && (
            <div className="flex items-start gap-2 text-sm bg-muted/50 rounded-md p-3">
              <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <span>
                {grupos.map((g, i) => `${prefijoGrupo.trim() || 'Grupo'} ${letraGrupo(i)}: ${g.length}`).join(' · ')}
              </span>
            </div>
          )}

          {equipoConBye && (
            <div className="flex items-start gap-2 text-sm bg-muted/50 rounded-md p-3">
              <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <span>
                Como el número de clasificados es impar, <span className="font-semibold">{equipoConBye.nombre}</span>{' '}
                (posición {equipoConBye.posicion}) pasa directo a la siguiente ronda: no le tocó rival en esta.
              </span>
            </div>
          )}

          {repechajesPendientes.length > 0 && (
            <div className="flex items-start gap-2 text-sm bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 rounded-md p-3">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {repechajesPendientes.length === 1 ? 'Falta jugar el repechaje' : `Faltan jugar ${repechajesPendientes.length} repechajes`}
                {': '}
                {repechajesPendientes.map((p) => `${p.localNombre} vs ${p.visitanteNombre}`).join(', ')}. Ahí se define el último
                equipo que pasa, así que las tablas de arriba todavía pueden cambiar y esta fase podría quedar sembrada con el
                equipo equivocado. Puedes armarla igual si necesitas dejar el calendario listo, pero revísala después del
                repechaje.
              </span>
            </div>
          )}

          {crucesConChoque.length > 0 && (
            <div className="flex items-start gap-2 text-sm bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 rounded-md p-3">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Con estos orígenes, {crucesConChoque.length === 1 ? 'un cruce enfrenta' : `${crucesConChoque.length} cruces enfrentan`} a dos
                equipos del mismo grupo: {crucesConChoque.map((c) => `${c.local.nombre} vs ${c.visitante.nombre}`).join(', ')}. Puedes
                ajustar manualmente qué equipos marcaste arriba si quieres evitarlo.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Vista previa ── */}
      <Card>
        <CardContent className="p-0">
          <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-sm font-bold">3. Vista previa</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {partidosGenerados.length} {partidosGenerados.length === 1 ? 'partido' : 'partidos'}
                {formato !== 'grupos' && ` para "${nombreFaseActual}"`}
              </p>
            </div>
          </div>

          {partidosGenerados.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Marca al menos dos equipos clasificados para ver los partidos.
            </div>
          ) : (
            <div className="divide-y max-h-100 overflow-y-auto">
              {partidosGenerados.map((p) => (
                <div key={p.clave} className="flex items-center gap-3 px-6 py-2 text-sm">
                  <span className="text-xs text-muted-foreground font-mono w-16 shrink-0">Sem {p.semana}</span>
                  {formato === 'grupos' && (
                    <span className="text-xs font-semibold text-primary w-20 shrink-0">{p.fase}</span>
                  )}
                  <span className="flex-1">
                    <span className="font-semibold">{p.local.nombre}</span>
                    <span className="text-muted-foreground"> vs </span>
                    <span className="font-semibold">{p.visitante.nombre}</span>
                  </span>
                  {p.fecha && <span className="text-xs text-muted-foreground font-mono">{p.fecha}</span>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {partidosGenerados.length > 0 && (
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <Input
            className="h-9 w-56"
            placeholder="Nombre de la Programación (opcional)"
            value={nombreProgramacion}
            onChange={(e) => setNombreProgramacion(e.target.value)}
          />
          <Button onClick={guardar} disabled={crearLote.isPending}>
            <Trophy className="h-4 w-4 mr-2" />
            {crearLote.isPending
              ? 'Guardando...'
              : `Guardar ${partidosGenerados.length} ${partidosGenerados.length === 1 ? 'partido' : 'partidos'}`}
          </Button>
        </div>
      )}
    </div>
  );
}
