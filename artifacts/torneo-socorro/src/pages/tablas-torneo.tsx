import { Trophy } from 'lucide-react';
import Posiciones from '@/pages/posiciones';
import Goleadores from '@/pages/goleadores';
import Vallas from '@/pages/vallas';
import MatrizResultados from '@/pages/matriz-resultados';
import { CuadroFinalSeccion } from '@/pages/cuadro-final-seccion';

/**
 * Las tres tablas de consulta del torneo en una sola pantalla: posiciones
 * arriba (con sus propias pestañas por fase) y, debajo, goleadores y valla
 * menos vencida una al lado de la otra.
 *
 * A propósito NO usa pestañas para elegir entre las tres: posiciones ya
 * tiene las suyas por fase, y anidar dos filas de pestañas confundiría más
 * de lo que ayuda. Así se ven las tres sin un solo clic, que es como se
 * consultan de verdad al terminar una jornada. Cada tabla trae su propio
 * botón de imprimir, para poder mandar solo una por WhatsApp.
 */
export default function TablasTorneo() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 text-primary rounded-lg">
          <Trophy className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Tablas del torneo</h1>
          <p className="text-muted-foreground mt-1">Posiciones, goleadores y valla menos vencida</p>
        </div>
      </div>

      <Posiciones embebido />

      <MatrizResultados embebido />

      {/* Solo aparece cuando el torneo ya llegó a la fase de eliminación. */}
      <CuadroFinalSeccion />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <Goleadores embebido />
        <Vallas embebido />
      </div>
    </div>
  );
}
