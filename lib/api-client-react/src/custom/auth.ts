// Hooks de autenticación (login, sesión actual y cambio de contraseña).
//
// A diferencia del resto de este paquete, este archivo NO es generado por
// orval: el tag "auth" está excluido del cliente de React (ver
// lib/api-spec/orval.config.ts). Los endpoints SÍ están en el openapi.yaml
// y el cliente zod sí los genera; acá se escriben a mano siguiendo el mismo
// patrón (customFetch + react-query) para que se integren igual que los
// demás hooks.
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

export interface CambiarPasswordInput {
  passwordActual: string;
  passwordNueva: string;
}

export const cambiarPassword = (body: CambiarPasswordInput): Promise<{ ok: boolean }> => {
  return customFetch<{ ok: boolean }>("/api/auth/password", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
};

export const useCambiarPassword = () => {
  return useMutation<{ ok: boolean }, ErrorType<{ error?: string }>, CambiarPasswordInput>({
    mutationFn: (body) => cambiarPassword(body),
  });
};
