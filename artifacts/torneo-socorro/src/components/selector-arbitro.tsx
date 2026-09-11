import { useState } from 'react';
import { useGetArbitros, type Arbitro } from '@workspace/api-client-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { ArbitroFormDialog } from '@/components/arbitro-form-dialog';

// Valores de escape: un <SelectItem> siempre necesita un value no vacío, así
// que "sin asignar" y "crear uno nuevo" usan estos en vez de "" o el id real.
const SIN_ASIGNAR = '__sin_asignar__';
const NUEVO = '__nuevo__';

interface SelectorArbitroProps {
  value: number | null | undefined;
  onChange: (arbitroId: number | null) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}

/**
 * Elegir el árbitro de un partido, buscando entre los ya registrados en vez
 * de escribir el nombre a mano — así "Aníbal Bolívar" es siempre el mismo
 * árbitro y sus estadísticas se pueden sumar de verdad (ver /arbitros).
 *
 * Si hace falta uno que todavía no existe, "+ Nuevo árbitro..." abre el
 * alta rápida sin salir de este formulario.
 */
export function SelectorArbitro({ value, onChange, disabled, placeholder = 'Sin asignar', id }: SelectorArbitroProps) {
  const { data: arbitros } = useGetArbitros({ activo: true });
  const [crearOpen, setCrearOpen] = useState(false);

  const seleccionado = arbitros?.find((a) => a.id === value);

  const handleChange = (v: string) => {
    if (v === NUEVO) {
      setCrearOpen(true);
      return;
    }
    onChange(v === SIN_ASIGNAR ? null : Number(v));
  };

  return (
    <>
      <Select value={value != null ? String(value) : SIN_ASIGNAR} onValueChange={handleChange} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder}>
            {value == null ? placeholder : (seleccionado?.nombre ?? 'Árbitro asignado')}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SIN_ASIGNAR}>Sin asignar</SelectItem>
          {/* Si el árbitro asignado ya quedó inactivo, se muestra igual para
              que no se vea en blanco — solo no aparece para asignar de nuevo. */}
          {arbitros
            ?.filter((a) => a.activo || a.id === value)
            .map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.nombre}{!a.activo && ' (inactivo)'}
              </SelectItem>
            ))}
          <SelectItem value={NUEVO}>
            <span className="flex items-center gap-1.5 text-primary">
              <Plus className="h-3.5 w-3.5" /> Nuevo árbitro...
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      <ArbitroFormDialog
        open={crearOpen}
        onOpenChange={setCrearOpen}
        arbitro={null}
        onSaved={(nuevo: Arbitro) => onChange(nuevo.id)}
      />
    </>
  );
}
