import * as React from "react"

/**
 * Logo oficial del Torneo Socorro Senior Master Plus 40.
 * Imagen real del torneo (public/logo-torneo-socorro.png), servida como
 * asset estático de Vite. Se usa en el login, el sidebar y el favicon.
 */
export function TorneoSocorroLogo({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <img
      src="/logo-torneo-socorro.png"
      alt="Escudo Torneo Socorro Senior Master Plus 40"
      className={`${className} object-contain`}
    />
  )
}
