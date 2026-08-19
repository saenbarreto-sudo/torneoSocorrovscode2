// Hook para la tabla de valla menos vencida (goles recibidos por equipo).
// No es generado por orval; sigue el mismo patrón que custom/goles.ts.
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { customFetch, type ErrorType } from "../custom-fetch";
import type { Valla } from "../generated/api.schemas";

export const getGetVallasQueryKey = () => ["/api/vallas"] as const;

const getVallas = (): Promise<Valla[]> => customFetch<Valla[]>("/api/vallas", { method: "GET" });

export function useGetVallas(options?: { query?: Partial<UseQueryOptions<Valla[], ErrorType<unknown>>> }) {
  return useQuery<Valla[], ErrorType<unknown>>({
    queryKey: getGetVallasQueryKey(),
    queryFn: getVallas,
    ...options?.query,
  });
}
