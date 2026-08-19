import { ApiError } from "@workspace/api-client-react"

/**
 * Extrae el mensaje amigable que manda el backend (campo "error" del
 * cuerpo de la respuesta) en vez de mostrar el texto crudo "HTTP 409...".
 * Se usa sobre todo en los onError de mutaciones de borrado, para explicar
 * por qué no se pudo eliminar algo (p. ej. una tarjeta con un pago asociado).
 */
export function extractErrorMessage(err: unknown, fallback = "Ocurrió un error inesperado, intenta de nuevo."): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: string } | null
    return data?.error ?? fallback
  }
  return fallback
}
