import * as React from "react"
import { customFetch, setAuthTokenGetter, ApiError } from "@workspace/api-client-react"

/**
 * Roles del sistema. "publico" es el único que no tiene cuenta en la base
 * de datos: cualquiera puede entrar como invitado, solo a consultar.
 */
export type Role = "admin" | "delegado" | "publico"

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Comité Organizador",
  delegado: "Delegado de equipo",
  publico: "Invitado",
}

export interface AuthUser {
  id: number
  username: string
  nombre: string
  rol: Exclude<Role, "publico">
  equipoId: number | null
}

/**
 * Rutas visibles/permitidas por rol. "*" = todas.
 *
 * "/pagos", "/pagos/resumen" y "/egresos" ya no son páginas propias (son
 * las tres pestañas de "/tesoreria"), pero se mantienen acá porque siguen
 * siendo el permiso de cada pestaña: el delegado entra a Tesorería y solo
 * ve el estado de cuenta, no los recibos ni los egresos del torneo.
 */
const ROUTE_PERMISSIONS: Record<Role, string[] | "*"> = {
  admin: "*",
  delegado: ["/", "/tablas", "/posiciones", "/programacion", "/partidos", "/jugadores", "/goleadores", "/vallas", "/amonestados", "/tesoreria", "/pagos/resumen"],
  publico: ["/", "/tablas", "/posiciones", "/programacion", "/partidos", "/jugadores", "/goleadores", "/vallas", "/amonestados"],
}

export function canAccessRoute(role: Role | null, path: string): boolean {
  if (!role) return false
  const allowed = ROUTE_PERMISSIONS[role]
  if (allowed === "*") return true
  return allowed.includes(path)
}

/** true si el rol solo puede consultar, no crear/editar/eliminar registros */
export function isReadOnlyRole(role: Role): boolean {
  return role === "delegado" || role === "publico"
}

/**
 * Recursos sobre los que cada rol puede crear/editar/eliminar (además de
 * consultar). Comité Organizador puede escribir en todo. Delegado e
 * Invitado nunca pueden escribir, solo consultar.
 */
const WRITE_PERMISSIONS: Record<Role, string[] | "*"> = {
  admin: "*",
  delegado: [],
  publico: [],
}

/**
 * Si se está viendo un torneo YA CERRADO, nadie puede escribir — ni el
 * Comité. Cualquier cosa que se guardara iría contra el torneo en curso (la
 * API solo escribe ahí), así que se registraría en el año equivocado. Lo
 * fija TemporadaProvider al cambiar de torneo; ver lib/temporada.tsx.
 */
let _temporadaEnCurso = true

export function setTemporadaEnCurso(enCurso: boolean): void {
  _temporadaEnCurso = enCurso
}

/** true si el rol puede crear/editar/eliminar en el recurso indicado. */
export function canWrite(role: Role | null, resource: string): boolean {
  if (!role) return false
  if (!_temporadaEnCurso) return false
  const allowed = WRITE_PERMISSIONS[role]
  if (allowed === "*") return true
  return allowed.includes(resource)
}

interface LoginResult {
  ok: boolean
  error?: string
}

interface AuthState {
  user: AuthUser | null
  role: Role | null
  isAuthenticated: boolean
  /** true mientras se restaura la sesión guardada al cargar la app */
  isLoading: boolean
  login: (username: string, password: string) => Promise<LoginResult>
  loginPublico: () => void
  logout: () => void
}

const AuthContext = React.createContext<AuthState | undefined>(undefined)

const TOKEN_KEY = "torneo-socorro.token"
const PUBLICO_KEY = "torneo-socorro.publico"

function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: string } | null
    return data?.error ?? "Usuario o contraseña incorrectos"
  }
  return "No se pudo conectar con el servidor"
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null)
  const [role, setRole] = React.useState<Role | null>(null)
  const [isLoading, setLoading] = React.useState(true)
  const tokenRef = React.useRef<string | null>(null)

  // Registra el proveedor de token para que TODAS las llamadas del cliente
  // API (customFetch / hooks generados) manden "Authorization: Bearer ..."
  // automáticamente, sin tener que pasarlo a mano en cada request.
  React.useEffect(() => {
    setAuthTokenGetter(() => tokenRef.current)
    return () => setAuthTokenGetter(null)
  }, [])

  // Al cargar la app, intenta restaurar la sesión guardada (token válido o
  // modo Público) para no pedir login de nuevo en cada recarga de página.
  React.useEffect(() => {
    let cancelled = false

    async function restore() {
      try {
        const savedToken = sessionStorage.getItem(TOKEN_KEY)
        if (savedToken) {
          tokenRef.current = savedToken
          const me = await customFetch<AuthUser>("/api/auth/me")
          if (cancelled) return
          setUser(me)
          setRole(me.rol)
        } else if (sessionStorage.getItem(PUBLICO_KEY) === "1") {
          if (!cancelled) setRole("publico")
        }
      } catch {
        tokenRef.current = null
        try {
          sessionStorage.removeItem(TOKEN_KEY)
        } catch {
          // no-op
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    restore()
    return () => {
      cancelled = true
    }
  }, [])

  const login = React.useCallback(async (username: string, password: string): Promise<LoginResult> => {
    try {
      const result = await customFetch<{ token: string; user: AuthUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password }),
      })
      tokenRef.current = result.token
      setUser(result.user)
      setRole(result.user.rol)
      try {
        sessionStorage.setItem(TOKEN_KEY, result.token)
        sessionStorage.removeItem(PUBLICO_KEY)
      } catch {
        // sessionStorage no disponible; la sesión sigue en memoria
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: extractErrorMessage(err) }
    }
  }, [])

  const loginPublico = React.useCallback(() => {
    tokenRef.current = null
    setUser(null)
    setRole("publico")
    try {
      sessionStorage.setItem(PUBLICO_KEY, "1")
      sessionStorage.removeItem(TOKEN_KEY)
    } catch {
      // no-op
    }
  }, [])

  const logout = React.useCallback(() => {
    tokenRef.current = null
    setUser(null)
    setRole(null)
    try {
      sessionStorage.removeItem(TOKEN_KEY)
      sessionStorage.removeItem(PUBLICO_KEY)
    } catch {
      // no-op
    }
  }, [])

  const value: AuthState = {
    user,
    role,
    isAuthenticated: role !== null,
    isLoading,
    login,
    loginPublico,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>")
  return ctx
}
