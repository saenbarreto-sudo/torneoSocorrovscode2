import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** "2026-03-14" → "14/03/2026". Corta la hora si el valor la trae. */
export function formatFecha(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const [y, m, d] = fecha.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}

export function formatMoney(amount: number | null | undefined) {
  if (amount == null) return "$0";
  return new Intl.NumberFormat('es-CO', { 
    style: 'currency', 
    currency: 'COP', 
    maximumFractionDigits: 0 
  }).format(amount);
}

/**
 * Convierte una hora en formato 24h ("15:30") al formato de 12 horas que
 * se usa en el torneo ("03:30 PM"). Si el valor no es una hora válida se
 * devuelve tal cual, para no romper datos viejos.
 */
export function formatHora12(hora: string | null | undefined): string {
  if (!hora) return '';
  const [h, m] = hora.split(':');
  const horas = Number(h);
  const minutos = m ?? '00';
  if (Number.isNaN(horas)) return hora;
  const sufijo = horas >= 12 ? 'PM' : 'AM';
  const hora12 = horas % 12 === 0 ? 12 : horas % 12;
  return `${String(hora12).padStart(2, '0')}:${minutos.padStart(2, '0')} ${sufijo}`;
}
