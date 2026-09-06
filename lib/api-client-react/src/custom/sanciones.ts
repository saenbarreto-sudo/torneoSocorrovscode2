// Hook de sanciones vigentes (fechas de suspensión cumplidas y pendientes).
// No es generado por orval; sigue el patrón de custom/goles.ts.
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { customFetch, type ErrorType } from "../custom-fetch";

// Tipo definido aquí porque el tag "sanciones" se excluye del cliente de
// React en orval.config.ts. Debe coincidir con el schema "Sancion" de
// openapi.yaml.
export interface Sancion {
  tarjetaId: number;
  jugadorId: number;
  jugadorNombre: string;
  equipoId: number;
  equipoNombre: string;
  tipo: string;
  semana: number;
  /** @nullable */
  fecha?: string | null;
  fechasSancion: number;
  fechasCumplidas: number;
  fechasPendientes: number;
}

export const getGetSancionesQueryKey = () => ["/api/sanciones"] as const;

export function useGetSanciones(options?: { query?: Partial<UseQueryOptions<Sancion[], ErrorType<unknown>>> }) {
  return useQuery<Sancion[], ErrorType<unknown>>({
    queryKey: getGetSancionesQueryKey(),
    queryFn: () => customFetch<Sancion[]>("/api/sanciones", { method: "GET" }),
    ...options?.query,
  });
}
