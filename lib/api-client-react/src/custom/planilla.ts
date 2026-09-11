// Hooks de la planilla del partido (nómina, goles y tarjetas en una sola
// operación). No es generado por orval; sigue el patrón de custom/goles.ts.
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { customFetch, type ErrorType } from "../custom-fetch";

// Los tipos viven aquí (y no en "generated/api.schemas") a propósito: el
// endpoint está documentado en openapi.yaml, pero se excluye del cliente de
// React en orval.config.ts para conservar los hooks de este archivo, así que
// orval no emite sus tipos. Deben coincidir con los schemas "Planilla",
// "PlanillaJugador" y "SavePlanillaInput" del contrato.
export interface PlanillaJugador {
  jugadorId: number;
  jugadorNombre: string;
  equipoId: number;
  /** @nullable */
  nCarnet?: number | null;
  jugo: boolean;
  /** @nullable */
  dorsal?: number | null;
  titular: boolean;
  goles: number;
  amarillas: number;
  rojas: number;
  fechasSancion?: number;
  /**
   * Fechas de sanción que el jugador todavía NO había cumplido cuando se
   * jugó este partido. Mayor que cero = no se puede alinear.
   */
  fechasPendientes?: number;
}

export interface Planilla {
  partidoId: number;
  localId: number;
  visitanteId: number;
  /** @nullable */
  arbitro?: string | null;
  /** @nullable */
  mesa?: string | null;
  jugadores: PlanillaJugador[];
}

export interface SavePlanillaInput {
  arbitro?: string;
  mesa?: string;
  // Ya no se manda valorAmarilla/valorRoja: el backend le asigna a cada
  // tarjeta nueva el valor configurado en Ajustes, automáticamente.
  jugadores: {
    jugadorId: number;
    jugo: boolean;
    dorsal?: number | null;
    titular?: boolean;
    goles?: number;
    amarillas?: number;
    rojas?: number;
    fechasSancion?: number;
  }[];
}

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
