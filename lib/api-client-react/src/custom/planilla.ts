// Hooks de la planilla del partido (nómina, goles y tarjetas en una sola
// operación). No es generado por orval; sigue el patrón de custom/goles.ts.
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { customFetch, type ErrorType } from "../custom-fetch";
import type { Planilla, SavePlanillaInput } from "../generated/api.schemas";

export const getGetPlanillaQueryKey = (partidoId: number) => ["/api/partidos", partidoId, "planilla"] as const;

export function useGetPlanilla(
  partidoId: number,
  options?: { query?: Partial<UseQueryOptions<Planilla, ErrorType<unknown>>> },
) {
  return useQuery<Planilla, ErrorType<unknown>>({
    queryKey: getGetPlanillaQueryKey(partidoId),
    queryFn: () => customFetch<Planilla>(`/api/partidos/${partidoId}/planilla`, { method: "GET" }),
    ...options?.query,
  });
}

export function useSavePlanilla(partidoId: number) {
  const queryClient = useQueryClient();
  return useMutation<void, ErrorType<{ error?: string }>, SavePlanillaInput>({
    mutationFn: (data) =>
      customFetch<void>(`/api/partidos/${partidoId}/planilla`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetPlanillaQueryKey(partidoId) });
      queryClient.invalidateQueries({ queryKey: ["/api/partidos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posiciones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/goleadores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tarjetas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/amonestados"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vallas"] });
    },
  });
}
