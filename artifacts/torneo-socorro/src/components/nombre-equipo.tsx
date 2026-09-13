import { colorDeEquipo } from '@/lib/color-equipo';

/**
 * El nombre de un equipo con su punto de color al lado.
 *
 * Existe para poder recorrer una tabla con la vista en vez de leer nombre
 * por nombre: en una tabla de nueve equipos, el color ubica la fila mucho
 * antes que el texto.
 */
export function NombreEquipo({
  nombre,
  color,
  className = '',
}: {
  nombre: string;
  /** El color configurado del equipo, si tiene. Si no, se calcula del nombre. */
  color?: string | null;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className="h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-black/10"
        style={{ background: colorDeEquipo(nombre, color) }}
        aria-hidden
      />
      {nombre}
    </span>
  );
}
