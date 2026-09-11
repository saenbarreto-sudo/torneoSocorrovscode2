import * as React from "react"
import { useCambiarPassword } from "@workspace/api-client-react"
import { ROLE_LABELS, useAuth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { extractErrorMessage } from "@/lib/api-errors"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { KeyRound, Loader2 } from "lucide-react"

/**
 * La tarjeta de "Sesión activa" del menú lateral, con el botón para que cada
 * quien cambie su propia contraseña. Aparece igual en el menú de escritorio
 * y en el cajón del celular.
 *
 * El botón solo sale si hay una cuenta de verdad: quien entró como Público
 * no tiene contraseña que cambiar.
 */
export function TarjetaSesion() {
  const { user, role } = useAuth()
  const { toast } = useToast()
  const cambiar = useCambiarPassword()

  const [abierto, setAbierto] = React.useState(false)
  const [actual, setActual] = React.useState("")
  const [nueva, setNueva] = React.useState("")
  const [confirmacion, setConfirmacion] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  const sessionLabel = user ? user.nombre : ROLE_LABELS.publico

  function limpiar() {
    setActual("")
    setNueva("")
    setConfirmacion("")
    setError(null)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (nueva.length < 4) {
      setError("La contraseña nueva debe tener al menos 4 caracteres")
      return
    }
    if (nueva !== confirmacion) {
      setError("La confirmación no coincide con la contraseña nueva")
      return
    }

    try {
      await cambiar.mutateAsync({ passwordActual: actual, passwordNueva: nueva })
      toast({ title: "Contraseña actualizada", description: "Úsala la próxima vez que ingreses." })
      setAbierto(false)
      limpiar()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  return (
    <div className="mx-4 mb-3 px-3 py-2 rounded-md bg-sidebar-accent">
      <p className="text-[10px] uppercase tracking-wide text-sidebar-accent-foreground/70 font-bold">
        Sesión activa
      </p>
      <p className="text-sm font-semibold text-sidebar-accent-foreground">{sessionLabel}</p>
      <p className="text-xs text-sidebar-accent-foreground/70">{role ? ROLE_LABELS[role] : ""}</p>

      {user && (
        <>
          <button
            type="button"
            onClick={() => {
              limpiar()
              setAbierto(true)
            }}
            className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-sidebar-accent-foreground/80 hover:text-white transition-colors"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Cambiar mi contraseña
          </button>

          <Dialog
            open={abierto}
            onOpenChange={(v) => {
              setAbierto(v)
              if (!v) limpiar()
            }}
          >
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Cambiar mi contraseña</DialogTitle>
                <DialogDescription>
                  Escribe la contraseña que usas hoy y la nueva que quieres de ahora en adelante.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password-actual">Contraseña actual</Label>
                  <Input
                    id="password-actual"
                    type="password"
                    placeholder="••••••••"
                    value={actual}
                    onChange={(e) => setActual(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password-nueva">Contraseña nueva</Label>
                  <Input
                    id="password-nueva"
                    type="password"
                    placeholder="Mínimo 4 caracteres"
                    value={nueva}
                    onChange={(e) => setNueva(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password-confirmacion">Repite la contraseña nueva</Label>
                  <Input
                    id="password-confirmacion"
                    type="password"
                    placeholder="••••••••"
                    value={confirmacion}
                    onChange={(e) => setConfirmacion(e.target.value)}
                  />
                </div>

                {error && <p className="text-sm font-semibold text-destructive">{error}</p>}

                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={cambiar.isPending || !actual || !nueva || !confirmacion}
                  >
                    {cambiar.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Guardar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}
