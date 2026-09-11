import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGetTemporadas, useGetResumenCierre, useCerrarTemporada } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { extractErrorMessage } from '@/lib/api-errors';
import { formatFecha } from '@/lib/utils';
import { Archive, AlertTriangle, Loader2 } from 'lucide-react';

/**
 * Cerrar el torneo actual y dejar la app lista para el siguiente, sin
 * borrar nada: todo lo del torneo en curso queda sellado con su nombre y
 * desaparece de las pantallas en vivo, pero sigue guardado y se ve en la
 * trayectoria de cada jugador.
 *
 * Es la acción más delicada de la app — toca todos los datos del torneo de
 * una sola vez — así que antes de hacerla se muestra exactamente qué se va
 * a sellar y se exige escribir el nombre del torneo para confirmar.
 */

/** Lo que se sella, en el orden en que se le muestra al usuario. */
const LINEAS: Array<{ clave: keyof ResumenConteos; etiqueta: string }> = [
  { clave: 'partidos', etiqueta: 'Partidos' },
  { clave: 'goles', etiqueta: 'Goles' },
  { clave: 'tarjetas', etiqueta: 'Tarjetas' },
  { clave: 'pagos', etiqueta: 'Recibos y pagos' },
  { clave: 'egresos', etiqueta: 'Egresos' },
  { clave: 'mesas', etiqueta: 'Mesas' },
  { clave: 'programacion', etiqueta: 'Jornadas de la programación' },
  { clave: 'fases', etiqueta: 'Fases' },
];

interface ResumenConteos {
  partidos: number;
  goles: number;
  tarjetas: number;
  pagos: number;
  egresos: number;
  mesas: number;
  programacion: number;
  fases: number;
  jugadores: number;
}

export function CerrarTorneo() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: temporadas } = useGetTemporadas();
  const { data: resumen } = useGetResumenCierre();
  const cerrar = useCerrarTemporada();

  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);

  const hayAlgoQueCerrar = (resumen?.partidos ?? 0) > 0;
  const puedeConfirmar = confirmacion.trim() === nombre.trim() && /^\d{4}-\d{4}$/.test(nombre.trim());

  function abrir() {
    setNombre(resumen?.nombreSugerido ?? '');
    setConfirmacion('');
    setError(null);
    setAbierto(true);
  }

  async function onCerrar() {
    setError(null);
    try {
      const r = await cerrar.mutateAsync({ data: { nombre: nombre.trim() } });
      // Cambió prácticamente todo: se refresca la app entera.
      await queryClient.invalidateQueries();
      setAbierto(false);
      toast({
        title: `Torneo ${r.nombre} cerrado`,
        description: `Quedaron guardados ${r.partidos} partidos. La app está lista para el torneo nuevo.`,
      });
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-lg shrink-0">
            <Archive className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-lg">Cerrar el torneo</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Guarda todo lo del torneo actual bajo su nombre y deja la app lista para el siguiente.
              No se borra nada: los datos siguen ahí y se siguen viendo en la trayectoria de cada jugador.
            </p>
          </div>
        </div>

        {temporadas && temporadas.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Torneos guardados:</span>
            {temporadas.map((t) => (
              <Badge key={t.nombre} variant="secondary" title={t.cerradaAt ? `Cerrado el ${formatFecha(t.cerradaAt.slice(0, 10))}` : 'Importado de los Excel'}>
                {t.nombre}
              </Badge>
            ))}
          </div>
        )}

        {hayAlgoQueCerrar ? (
          <Button variant="outline" onClick={abrir}>
            <Archive className="h-4 w-4 mr-1.5" />
            Cerrar el torneo actual
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            No hay nada que cerrar todavía: el torneo actual no tiene partidos.
          </p>
        )}

        <Dialog open={abierto} onOpenChange={setAbierto}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Cerrar el torneo</DialogTitle>
              <DialogDescription>
                Esto guarda todo lo de abajo bajo el nombre del torneo y deja la app en blanco para empezar
                el siguiente. No se borra nada.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border divide-y text-sm">
              {LINEAS.filter((l) => (resumen?.[l.clave] ?? 0) > 0).map((l) => (
                <div key={l.clave} className="flex justify-between px-3 py-1.5">
                  <span className="text-muted-foreground">{l.etiqueta}</span>
                  <span className="font-mono font-semibold">{resumen?.[l.clave]}</span>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p>
                  Las sanciones pendientes <span className="font-semibold">mueren con el torneo</span>: nadie
                  arrastra fechas al torneo nuevo.
                </p>
                <p>
                  Los equipos y jugadores se mantienen como están. Desactiva después los que no sigan.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cerrar-nombre">Nombre del torneo que se cierra</Label>
              <Input
                id="cerrar-nombre"
                placeholder="2026-2027"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cerrar-confirmacion">
                Para confirmar, escribe <span className="font-mono font-bold">{nombre || '2026-2027'}</span>
              </Label>
              <Input
                id="cerrar-confirmacion"
                placeholder={nombre || '2026-2027'}
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
              />
            </div>

            {error && <p className="text-sm font-semibold text-destructive">{error}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
              <Button onClick={onCerrar} disabled={!puedeConfirmar || cerrar.isPending}>
                {cerrar.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Cerrar el torneo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
