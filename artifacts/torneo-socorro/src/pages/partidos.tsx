import { useState } from 'react';
import { useAuth, canAccessRoute } from '@/lib/auth';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Swords } from 'lucide-react';
import PartidosLista from '@/pages/partidos-lista';
import Cronograma from '@/pages/programacion';

/**
 * Todo lo que tiene que ver con los partidos en una sola pantalla: el
 * cronograma (armar las jornadas, imprimirlas) y la lista de partidos con
 * sus resultados.
 *
 * Las dos pestañas están conectadas: desde una jornada del cronograma, el
 * botón "ver sus partidos" abre la otra pestaña ya filtrada por las fechas
 * de esa jornada. Antes había que saber de memoria qué número de semana era
 * el sábado que se quería cargar, porque el cronograma trabaja por fechas y
 * la lista de partidos filtraba por número de semana.
 */
type Pestana = 'cronograma' | 'partidos';

export default function Partidos() {
  const { role } = useAuth();
  const veCronograma = canAccessRoute(role, '/programacion');

  const [pestana, setPestana] = useState<Pestana>(veCronograma ? 'cronograma' : 'partidos');
  const [jornadaId, setJornadaId] = useState<number | 'all'>('all');

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 text-primary rounded-lg">
          <Swords className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Partidos</h1>
          <p className="text-muted-foreground mt-1">Cronograma de jornadas, partidos y resultados</p>
        </div>
      </div>

      {veCronograma && (
        <Tabs value={pestana} onValueChange={(v) => setPestana(v as Pestana)}>
          <TabsList>
            <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
            <TabsTrigger value="partidos">Partidos y resultados</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {pestana === 'cronograma' && veCronograma ? (
        <Cronograma
          embebido
          onVerPartidos={(prog) => {
            setJornadaId(prog.id);
            setPestana('partidos');
          }}
        />
      ) : (
        <PartidosLista embebido jornadaId={jornadaId} onJornadaChange={setJornadaId} />
      )}
    </div>
  );
}
