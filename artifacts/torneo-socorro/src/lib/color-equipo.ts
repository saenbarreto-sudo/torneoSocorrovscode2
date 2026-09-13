/**
 * El color con el que se reconoce a cada equipo en las tablas.
 *
 * Si el equipo tiene color configurado (Equipos → color), manda ese. Si no
 * —que es lo normal, porque casi nunca se llena—, se le calcula uno a
 * partir del nombre: así cada equipo tiene SIEMPRE el mismo color en todas
 * las pantallas, sin que nadie tenga que configurar nada, y dos equipos
 * distintos no se confunden.
 *
 * Los colores se eligieron para que se distingan entre sí y se lean bien
 * tanto en claro como en oscuro.
 */
const PALETA = [
  '#2563eb', // azul
  '#16a34a', // verde
  '#ea580c', // naranja
  '#9333ea', // morado
  '#dc2626', // rojo
  '#0891b2', // cian
  '#ca8a04', // mostaza
  '#db2777', // fucsia
  '#4f46e5', // índigo
  '#65a30d', // oliva
];

export function colorDeEquipo(nombre: string, color?: string | null): string {
  if (color && color.trim()) return color;
  // Suma simple de los caracteres: da el mismo resultado siempre para el
  // mismo nombre, que es todo lo que hace falta.
  let suma = 0;
  for (let i = 0; i < nombre.length; i++) suma = (suma * 31 + nombre.charCodeAt(i)) % 100000;
  return PALETA[suma % PALETA.length];
}
