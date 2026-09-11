// Hooks para egresos (gastos de la organización: carnés, uniformes,
// balones, arbitraje, etc). Igual que custom/auth.ts y custom/goles.ts,
// este archivo NO es generado por orval — sigue el mismo patrón
// (customFetch + react-query) para integrarse igual que los demás hooks.
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { customFetch, type ErrorType } from "../custom-fetch";

// Tipos definidos aquí porque el tag "egresos" se excluye del cliente de
// React en orval.config.ts (ver ese archivo). Deben coincidir con los
// schemas "Egreso" y "EgresoInput" de openapi.yaml.
export interface Egreso {
  id: number;
  fecha: string;
  descripcion: string;
  /** @nullable */
  categoria?: string | null;
  valor: number;
  createdAt?: string;
}

export interface EgresoInput {
  /** @minLength 1 */
  fecha: string;
  /** @minLength 1 */
  descripcion: string;
  categoria?: string;
  valor: number;
}

/** Filtros del listado: categoría y rango de fechas (ver openapi.yaml). */
export interface EgresosFiltros {
  categoria?: string;
  desde?: string;
  hasta?: string;
}

/**
 * Los filtros entran en la clave de caché: si no, al cambiar de categoría
 * react-query serviría la lista anterior creyendo que es la misma consulta.
 */
export const getGetEgresosQueryKey = (filtros?: EgresosFiltros) =>
  filtros && Object.values(filtros).some(Boolean)
    ? (["/api/egresos", filtros] as const)
    : (["/api/egresos"] as const);

function construirUrl(filtros?: EgresosFiltros): string {
  const params = new URLSearchParams();
  if (filtros?.categoria) params.set("categoria", filtros.categoria);
  if (filtros?.desde) params.set("desde", filtros.desde);
  if (filtros?.hasta) params.set("hasta", filtros.hasta);
  const cadena = params.toString();
  return cadena ? `/api/egresos?${cadena}` : "/api/egresos";
}

const getEgresos = (filtros?: EgresosFiltros): Promise<Egreso[]> =>
  customFetch<Egreso[]>(construirUrl(filtros), { method: "GET" });

export function useGetEgresos(
  filtros?: EgresosFiltros,
  options?: { query?: Partial<UseQueryOptions<Egreso[], ErrorType<unknown>>> },
) {
  return useQuery<Egreso[], ErrorType<unknown>>({
    queryKey: getGetEgresosQueryKey(filtros),
    queryFn: () => getEgresos(filtros),
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

/** Para corregir un gasto ya registrado: solo se manda lo que cambió. */
export interface EgresoUpdate {
  fecha?: string;
  descripcion?: string;
  /** @nullable */
  categoria?: string | null;
  valor?: number;
}

export function useUpdateEgreso() {
  const queryClient = useQueryClient();
  return useMutation<Egreso, ErrorType<{ error?: string }>, { id: number; data: EgresoUpdate }>({
    mutationFn: ({ id, data }) =>
      customFetch<Egreso>(`/api/egresos/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      // Sin "exact": alcanza el listado sin filtros y todos los filtrados.
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
