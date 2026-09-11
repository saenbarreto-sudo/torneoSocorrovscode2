import { useGetTemporadas } from '@workspace/api-client-react';
import { useTemporada } from '@/lib/temporada';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History } from 'lucide-react';

/**
 * El selector de torneo del menú: "Torneo actual" o cualquiera de los ya
 * cerrados. Al elegir uno viejo, TODAS las pantallas pasan a mostrar ese
 * año en modo lectura (ver lib/temporada.tsx).
 *
 * Solo aparece si de verdad hay torneos cerrados que consultar — en una
 * instalación nueva no tiene nada que ofrecer y solo estorbaría.
 */

const EN_CURSO = '__en_curso__';

export function SelectorTemporada() {
  const { data: temporadas } = useGetTemporadas();
  const { temporada, verTemporada } = useTemporada();

  if (!temporadas || temporadas.length === 0) return null;

  return (
    <div className="mx-4 mb-3">
      <label
        htmlFor="selector-temporada"
        className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-sidebar-foreground/60 font-bold mb-1"
      >
        <History className="h-3 w-3" />
        Torneo que estás viendo
      </label>
      <Select
        value={temporada ?? EN_CURSO}
        onValueChange={(v) => verTemporada(v === EN_CURSO ? null : v)}
      >
        <SelectTrigger
          id="selector-temporada"
          className="h-8 bg-sidebar-accent border-sidebar-border text-sidebar-accent-foreground"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EN_CURSO}>Torneo actual</SelectItem>
          {temporadas.map((t) => (
            <SelectItem key={t.nombre} value={t.nombre}>{t.nombre}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * La franja de arriba que avisa que lo que se está viendo es un torneo ya
 * cerrado. Es lo que evita el error caro: creer que se está registrando un
 * pago del torneo actual cuando en realidad se está mirando el del año
 * pasado.
 */
export function AvisoTorneoCerrado() {
  const { temporada, viendoTorneoCerrado, verTemporada } = useTemporada();
  if (!viendoTorneoCerrado) return null;

  return (
    <div className="bg-amber-500/15 border-b border-amber-500/40 px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <History className="h-4 w-4 text-amber-600 shrink-0" />
      <span>
        Estás viendo el torneo <span className="font-bold">{temporada}</span>, que ya está cerrado.
        No se puede modificar nada.
      </span>
      <button
        type="button"
        onClick={() => verTemporada(null)}
        className="ml-auto font-semibold underline underline-offset-2 hover:no-underline"
      >
        Volver al torneo actual
      </button>
    </div>
  );
}
