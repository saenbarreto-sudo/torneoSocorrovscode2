import * as React from "react"
import { customFetch, setAuthTokenGetter, ApiError } from "@workspace/api-client-react"

/**
 * Roles del sistema. "publico" es el único que no tiene cuenta en la base
 * de datos: cualquiera puede entrar como invitado, solo a consultar.
 *
 * "superadmin" está por encima del Comité: hace todo lo que hace un admin y
 * además es el único que ve el registro de Actividad — que es justamente el
 * control de lo que hace el Comité — y el único que puede repartir ese rol.
 */
export type Role = "superadmin" | "admin" | "delegado" | "publico"

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Administrador del sistema",
  admin: "Comité Organizador",
  delegado: "Delegado de equipo",
  publico: "Invitado",
}

/**
 * true si el rol puede imprimir. El invitado entra a consultar desde el
 * celular, en la cancha: ve las tablas pero no genera documentos del
 * torneo, que son los que el Comité reparte.
 */
export function puedeImprimir(role: Role | null): boolean {
  return role !== null && role !== "publico"
}

/**
 * true si el rol es del Comité Organizador o el Administrador del sistema,
 * o sea quien organiza el torneo — no el delegado ni el invitado, que solo
 * consultan.
 */
export function esDelComite(role: Role | null): boolean {
  return role === "admin" || role === "superadmin"
}

/** true si el rol puede ver el registro de Actividad (quién hizo qué). */
export function puedeVerActividad(role: Role | null): boolean {
  return role === "superadmin"
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
 * El delegado tiene sus propias páginas ("/mi-equipo", "/mis-partidos",
 * "/mi-cuenta"), no una versión recortada de las del comité: todo lo que ve
 * es de su equipo. Lo único que comparte con el resto es "/tablas", que es
 * lo mismo que está en la cartelera.
 *
 * El invitado ve solo la cartelera. Ni la base de jugadores (que lleva las
 * cédulas de todo el torneo) ni nada de plata.
 *
 * Ojo: esto decide qué se MUESTRA. Lo que de verdad protege la información
 * está en el servidor (artifacts/api-server/src/lib/alcance.ts): aunque
 * alguien escriba la dirección a mano, la API no le entrega lo que no le
 * corresponde.
 */
const ROUTE_PERMISSIONS: Record<Role, string[] | "*"> = {
  superadmin: "*",
  admin: "*",
  delegado: ["/", "/mi-equipo", "/mis-partidos", "/mi-cuenta", "/tablas", "/posiciones", "/goleadores", "/vallas"],
  publico: ["/", "/tablas", "/posiciones", "/programacion", "/partidos", "/goleadores", "/vallas"],
}

/**
 * Rutas que ni el Comité ve: son del Administrador del sistema.
 *
 * Crear usuarios y repartir accesos no es tarea del Comité, y la Actividad
 * es el registro de lo que el Comité hace — si ellos manejaran las cuentas,
 * podrían crearse una a la medida y el control no serviría.
 */
const RUTAS_SOLO_SISTEMA = ["/usuarios"]

/**
 * Las pantallas del delegado son solo suyas. El Comité tiene permiso "*",
 * así que sin esto podía quedarse parado en "Mi equipo" al cambiar de
 * perfil — y esa pantalla, sin un equipo detrás, no tiene qué mostrar.
 */
const RUTAS_SOLO_DELEGADO = ["/mi-equipo", "/mis-partidos", "/mi-cuenta"]

export function canAccessRoute(role: Role | null, path: string): boolean {
  if (!role) return false
  if (RUTAS_SOLO_SISTEMA.includes(path)) return role === "superadmin"
  if (RUTAS_SOLO_DELEGADO.includes(path)) return role === "delegado"
  const allowed = ROUTE_PERMISSIONS[role]
  if (allowed === "*") return true
  return allowed.includes(path)
}

/**
 * Dónde arranca cada quien al entrar: su primera pestaña del menú.
 *
 * Hace falta porque la sesión anterior deja la dirección donde estaba: si
 * alguien sale estando en "Mi equipo" y entra después con otro perfil, sin
 * esto se quedaría en la pantalla del perfil anterior.
 */
export function rutaInicial(role: Role | null): string {
  return role === "delegado" ? "/mi-equipo" : "/"
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
  superadmin: "*",
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
  /**
   * true justo después de entrar (no al recargar la página): le dice al
   * enrutador que lleve a la persona a su pantalla de inicio. Recargar NO lo
   * activa, para no sacar a nadie de donde estaba trabajando.
   */
  recienIngreso: boolean
  /** Lo apaga cuando ya se llevó a la persona a su inicio. */
  ingresoAtendido: () => void
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
  const [recienIngreso, setRecienIngreso] = React.useState(false)
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
      setRecienIngreso(true)
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
    setRecienIngreso(true)
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

  const ingresoAtendido = React.useCallback(() => setRecienIngreso(false), [])

  const value: AuthState = {
    user,
    role,
    isAuthenticated: role !== null,
    isLoading,
    recienIngreso,
    ingresoAtendido,
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
