// Hooks para egresos (gastos de la organización: carnés, uniformes,
// balones, arbitraje, etc). Igual que custom/auth.ts y custom/goles.ts,
// este archivo NO es generado por orval — sigue el mismo patrón
// (customFetch + react-query) para integrarse igual que los demás hooks.
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { customFetch, type ErrorType } from "../custom-fetch";
import type { Egreso, EgresoInput } from "../generated/api.schemas";

export const getGetEgresosQueryKey = () => ["/api/egresos"] as const;

const getEgresos = (): Promise<Egreso[]> => customFetch<Egreso[]>("/api/egresos", { method: "GET" });

export function useGetEgresos(options?: { query?: Partial<UseQueryOptions<Egreso[], ErrorType<unknown>>> }) {
  return useQuery<Egreso[], ErrorType<unknown>>({
    queryKey: getGetEgresosQueryKey(),
    queryFn: getEgresos,
    ...options?.query,
  });
}

export function useCreateEgreso() {
  const queryClient = useQueryClient();
  return useMutation<Egreso, ErrorType<{ error?: string }>, { data: EgresoInput }>({
    mutationFn: ({ data }) =>
      customFetch<Egreso>("/api/egresos", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetEgresosQueryKey() });
    },
  });
}

export function useDeleteEgreso() {
  const queryClient = useQueryClient();
  return useMutation<void, ErrorType<{ error?: string }>, { id: number }>({
    mutationFn: ({ id }) => customFetch<void>(`/api/egresos/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetEgresosQueryKey() });
    },
  });
}
