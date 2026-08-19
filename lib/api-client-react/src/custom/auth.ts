// Hooks de autenticación (login por usuario/contraseña).
//
// A diferencia del resto de este paquete, este archivo NO es generado por
// orval (no hay endpoints de auth en el openapi.yaml todavía). Está escrito
// a mano siguiendo el mismo patrón (customFetch + react-query) para que se
// integre igual que los demás hooks. Si más adelante agregan /auth al
// openapi.yaml y corren "pnpm run codegen", esto se puede reemplazar por
// la versión generada.
import { useMutation, useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { customFetch, type ErrorType } from "../custom-fetch";

// Los roles de usuario (ver lib/db/src/schema/usuarios.ts). Se repite aquí
// en vez de importarse desde @workspace/db porque ese paquete abre una
// conexión a Postgres al cargarse (requiere DATABASE_URL) — no es seguro
// importarlo desde código que puede correr en el navegador.
export type RolUsuario = "admin" | "tesorero" | "mesa" | "delegado";

export interface SessionUser {
  id: number;
  username: string;
  nombre: string;
  rol: RolUsuario;
  equipoId: number | null;
}

export interface LoginResponse {
  token: string;
  user: SessionUser;
}

export const login = (username: string, password: string): Promise<LoginResponse> => {
  return customFetch<LoginResponse>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
};

export const useLogin = () => {
  return useMutation<LoginResponse, ErrorType<{ error?: string }>, { username: string; password: string }>({
    mutationFn: ({ username, password }) => login(username, password),
  });
};

export const getMe = (options?: Parameters<typeof customFetch>[1]): Promise<SessionUser> => {
  return customFetch<SessionUser>("/api/auth/me", { ...options, method: "GET" });
};

export const useMe = (options?: {
  query?: Partial<UseQueryOptions<SessionUser, ErrorType<unknown>>>;
  enabled?: boolean;
}) => {
  return useQuery<SessionUser, ErrorType<unknown>>({
    queryKey: ["/api/auth/me"],
    queryFn: () => getMe(),
    retry: false,
    ...options?.query,
    enabled: options?.enabled,
  });
};
