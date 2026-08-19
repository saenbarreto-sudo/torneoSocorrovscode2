// Hook de sanciones vigentes (fechas de suspensión cumplidas y pendientes).
// No es generado por orval; sigue el patrón de custom/goles.ts.
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { customFetch, type ErrorType } from "../custom-fetch";
import type { Sancion } from "../generated/api.schemas";

export const getGetSancionesQueryKey = () => ["/api/sanciones"] as const;

export function useGetSanciones(options?: { query?: Partial<UseQueryOptions<Sancion[], ErrorType<unknown>>> }) {
  return useQuery<Sancion[], ErrorType<unknown>>({
    queryKey: getGetSancionesQueryKey(),
    queryFn: () => customFetch<Sancion[]>("/api/sanciones", { method: "GET" }),
    ...options?.query,
  });
}
