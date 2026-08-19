// Hooks para goles individuales (quién anotó, en qué partido).
//
// Igual que custom/auth.ts, este archivo NO es generado por orval (no hay
// endpoints de /goles en el openapi.yaml todavía). Sigue el mismo patrón
// (customFetch + react-query) para integrarse igual que los demás hooks.
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { customFetch, type ErrorType } from "../custom-fetch";

export interface Gol {
  id: number;
  jugadorId: number;
  jugadorNombre: string;
  equipoNombre: string;
  partidoId?: number | null;
  semana: number;
  fecha?: string | null;
  cantidad: number;
  propio?: boolean;
  createdAt?: string;
}

export interface CreateGolInput {
  jugadorId: number;
  partidoId?: number;
  semana: number;
  fecha?: string;
  cantidad?: number;
  propio?: boolean;
}

export interface GetGolesParams {
  partidoId?: number;
}

export const getGolesQueryKey = (params?: GetGolesParams) => ["/api/goles", params ?? {}] as const;

const getGoles = (params?: GetGolesParams): Promise<Gol[]> => {
  const search = params?.partidoId != null ? `?partidoId=${params.partidoId}` : "";
  return customFetch<Gol[]>(`/api/goles${search}`, { method: "GET" });
};

export function useGetGoles(
  params?: GetGolesParams,
  options?: { query?: Partial<UseQueryOptions<Gol[], ErrorType<unknown>>> },
) {
  return useQuery<Gol[], ErrorType<unknown>>({
    queryKey: getGolesQueryKey(params),
    queryFn: () => getGoles(params),
    ...options?.query,
  });
}

export function useCreateGol() {
  const queryClient = useQueryClient();
  return useMutation<Gol, ErrorType<{ error?: string }>, CreateGolInput>({
    mutationFn: (data) =>
      customFetch<Gol>("/api/goles", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/goleadores"] });
    },
  });
}

export function useDeleteGol() {
  const queryClient = useQueryClient();
  return useMutation<void, ErrorType<{ error?: string }>, number>({
    mutationFn: (id) => customFetch<void>(`/api/goles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/goleadores"] });
    },
  });
}
