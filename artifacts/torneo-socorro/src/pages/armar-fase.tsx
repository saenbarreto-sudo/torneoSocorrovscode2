import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetFases,
  useGetPosiciones,
  useGetPartidos,
  useCreatePartidosLote,
  useCreateSemanaFecha,
  getGetPartidosQueryKey,
  getGetProgramacionQueryKey,
  getGetFasesQueryKey,
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

/** Valor especial para "de dónde salen los clasificados": la tabla general (primera + segunda vuelta). */
const TABLA_GENERAL = '__general__';

interface PartidoGenerado {
  clave: string;
  local: EquipoFixture;
  visitante: EquipoFixture;
  semana: number;
  fecha: string | null;
}

export default function ArmarFase() {
  const [, navigate] = useLocation();
  const { role } = useAuth();
  const puedeProgramar = canWrite(role, 'partidos');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const hoyISO = () => new Date().toISOString().slice(0, 10);

  // ── Paso 1: de dónde salen los clasificados ───────────────────────────────
  const { data: fasesExtra } = useGetFases();
  const [faseOrigen, setFaseOrigen] = useState<string>(TABLA_GENERAL);
  const { data: tabla, isLoading: cargandoTabla } = useGetPosiciones(
    faseOrigen === TABLA_GENERAL ? undefined : { fase: faseOrigen },
  );

  // ── Paso 2: cuántos clasifican, con la lista editable ─────────────────────
  const [cantidadClasifican, setCantidadClasifican] = useState('4');
  const cantidadNum = Math.max(0, Number(cantidadClasifican) || 0);

  // Arranca marcando los primeros N de la tabla elegida; el usuario puede
  // ajustar a mano (empates, exclusión puntual, etc.) sin que se le borre al
  // tipear en el mismo campo de cantidad — solo se reinicia si cambia la
  // tabla de origen o la cantidad.
  const claveSeleccion = `${faseOrigen}|${cantidadNum}`;
  const [seleccionInicializadaPara, setSeleccionInicializadaPara] = useState<string | null>(null);
  const [equiposElegidos, setEquiposElegidos] = useState<Set<number>>(new Set());

  if (tabla && seleccionInicializadaPara !== claveSeleccion) {
    setEquiposElegidos(new Set(tabla.filter((p) => p.posicion <= cantidadNum).map((p) => p.equipoId)));
    setSeleccionInicializadaPara(claveSeleccion);
  }

  const equiposClasificados: EquipoSembrado[] = useMemo(() => {
    if (!tabla) return [];
    return tabla
      .filter((p) => equiposElegidos.has(p.equipoId))
      .map((p) => ({ id: p.equipoId, nombre: p.equipoNombre, posicion: p.posicion }))
      .sort((a, b) => a.posicion - b.posicion);
  }, [tabla, equiposElegidos]);

  // ── Paso 3: formato de esta fase ───────────────────────────────────────────
  const [formato, setFormato] = useState<'liguilla' | 'eliminacion'>('liguilla');
  const [idaYVuelta, setIdaYVuelta] = useState(false);

  const nombreSugerido = useMemo(
    () => (formato === 'liguilla' ? 'Liguilla' : nombreFaseEliminacion(equiposClasificados.length)),
    [formato, equiposClasificados.length],
  );
  const [nombreFase, setNombreFase] = useState(nombreSugerido);
  const [nombreEditadoAMano, setNombreEditadoAMano] = useState(false);
  useEffect(() => {
    if (!nombreEditadoAMano) setNombreFase(nombreSugerido);
  }, [nombreSugerido, nombreEditadoAMano]);

  const { data: partidosExistentes } = useGetPartidos();
  const semanaSugerida = useMemo(() => {
    const maxima = (partidosExistentes ?? []).reduce((max, p) => Math.max(max, p.semana), 0);
    return maxima + 1;
  }, [partidosExistentes]);
  const [semanaInicial, setSemanaInicial] = useState('');
  const semanaInicialNum = semanaInicial === '' ? semanaSugerida : Number(semanaInicial);
  const [fechaInicial, setFechaInicial] = useState(hoyISO());
  const [diasEntreJornadas, setDiasEntreJornadas] = useState('7');
  const diasNum = Number(diasEntreJornadas) || 7;

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
          j.partidos.map((p) => ({ clave: p.clave, local: p.local, visitante: p.visitante, semana: p.semana, fecha: p.fecha })),
        ),
        equipoConBye: null,
      };
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
        });
        partidos.push({
          clave: `${cruce.clave}-vuelta`,
          local: cruce.mejor,
          visitante: cruce.peor,
          semana: semanaInicialNum + 1,
          fecha: fechaInicial ? sumarDias(fechaInicial, diasNum) : null,
        });
      } else {
        partidos.push({
          clave: cruce.clave,
          local: cruce.mejor,
          visitante: cruce.peor,
          semana: semanaInicialNum,
          fecha: fechaInicial || null,
        });
      }
    }
    return { partidos, equipoConBye: bye };
  }, [equiposClasificados, formato, idaYVuelta, semanaInicialNum, fechaInicial, diasNum]);

  // ── Guardar ────────────────────────────────────────────────────────────────
  const crearLote = useCreatePartidosLote();
  const crearProgramacion = useCreateSemanaFecha();
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
        fase: nombreFase.trim() || nombreSugerido,
      }));

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
        const nombre = nombreProgramacion.trim() || (nombreFase.trim() || nombreSugerido);
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
      toast({ title: `Fase "${nombreFase.trim() || nombreSugerido}" guardada`, description: detalles.join(' · ') });
      navigate('/posiciones');
    } catch (error) {
      toast({ title: 'No se pudo guardar la fase', description: extractErrorMessage(error), variant: 'destructive' });
    }
  };

  if (!puedeProgramar) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No tienes permiso para programar partidos.
        <div className="mt-4">
          <Button variant="outline" onClick={() => navigate('/posiciones')}>Volver</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/posiciones')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Armar fase</h1>
          <p className="text-muted-foreground mt-1">
            Elige quién clasifica, cómo se juega esta fase, y genera los partidos de una vez
          </p>
        </div>
      </div>

      {/* ── 1 y 2. Origen de los clasificados ── */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-sm font-bold">1. ¿Quién clasifica a esta fase?</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tabla de origen</Label>
              <Select value={faseOrigen} onValueChange={setFaseOrigen}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TABLA_GENERAL}>Tabla general</SelectItem>
                  {fasesExtra?.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cuántos clasifican</Label>
              <Input
                type="number"
                min={2}
                value={cantidadClasifican}
                onChange={(e) => setCantidadClasifican(e.target.value)}
              />
            </div>
          </div>

          {cargandoTabla ? (
            <p className="text-sm text-muted-foreground py-4">Cargando tabla...</p>
          ) : (
            <div className="border rounded-md divide-y max-h-80 overflow-y-auto">
              {tabla?.map((pos) => (
                <label
                  key={pos.equipoId}
                  className="flex items-center gap-3 px-4 py-2 text-sm cursor-pointer hover:bg-muted/50"
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
              {tabla?.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No hay equipos en esta tabla.</p>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {equiposClasificados.length} equipos marcados. Se marcaron solos los primeros {cantidadNum}, pero puedes
            ajustar la lista a mano.
          </p>
        </CardContent>
      </Card>

      {/* ── 3. Formato ── */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <h2 className="text-sm font-bold">2. ¿Cómo se juega esta fase?</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div className="space-y-1.5 lg:col-span-2">
              <Label>Nombre de la fase</Label>
              <Input
                value={nombreFase}
                onChange={(e) => {
                  setNombreFase(e.target.value);
                  setNombreEditadoAMano(true);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{formato === 'liguilla' ? 'Vueltas' : 'Partidos por cruce'}</Label>
              <Select value={idaYVuelta ? 'ida-vuelta' : 'solo-ida'} onValueChange={(v) => setIdaYVuelta(v === 'ida-vuelta')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="solo-ida">{formato === 'liguilla' ? 'Solo ida' : 'Partido único'}</SelectItem>
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
            {(formato === 'liguilla' ? true : idaYVuelta) && (
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

          {equipoConBye && (
            <div className="flex items-start gap-2 text-sm bg-muted/50 rounded-md p-3">
              <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <span>
                Como el número de clasificados es impar, <span className="font-semibold">{equipoConBye.nombre}</span>{' '}
                (posición {equipoConBye.posicion}) pasa directo a la siguiente ronda: no le tocó rival en esta.
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
                {partidosGenerados.length} {partidosGenerados.length === 1 ? 'partido' : 'partidos'} para "{nombreFase.trim() || nombreSugerido}"
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
