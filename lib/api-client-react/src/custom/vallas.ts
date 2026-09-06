// Hook para la tabla de valla menos vencida (goles recibidos por equipo).
// No es generado por orval; sigue el mismo patrón que custom/goles.ts.
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { customFetch, type ErrorType } from "../custom-fetch";

// Tipo definido aquí porque el tag "vallas" se excluye del cliente de React
// en orval.config.ts. Debe coincidir con el schema "Valla" de openapi.yaml.
export interface Valla {
  equipoId: number;
  equipoNombre: string;
  partidosJugados: number;
  golesRecibidos: number;
  promedio?: number;
}

export const getGetVallasQueryKey = () => ["/api/vallas"] as const;

const getVallas = (): Promise<Valla[]> => customFetch<Valla[]>("/api/vallas", { method: "GET" });

export function useGetVallas(options?: { query?: Partial<UseQueryOptions<Valla[], ErrorType<unknown>>> }) {
  return useQuery<Valla[], ErrorType<unknown>>({
    queryKey: getGetVallasQueryKey(),
    queryFn: getVallas,
    ...options?.query,
  });
}
