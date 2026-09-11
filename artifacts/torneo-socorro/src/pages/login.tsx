import * as React from "react"
import { TorneoSocorroLogo } from "@/components/logo"
import { useAuth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

export default function Login() {
  const { login, loginPublico } = useAuth()
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [mostrarAyuda, setMostrarAyuda] = React.useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) return
    setSubmitting(true)
    setError(null)
    const result = await login(username, password)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error ?? "No se pudo iniciar sesión")
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[hsl(273,51%,18%)] via-[hsl(273,51%,26%)] to-[hsl(340,74%,27%)] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-8">
          <TorneoSocorroLogo className="h-24 w-32 drop-shadow-lg" />
          <h1 className="mt-4 text-2xl font-extrabold text-white tracking-tight leading-tight">
            TORNEO SOCORRO
          </h1>
          <p className="text-white/80 text-sm font-semibold">SENIOR MASTER PLUS 40</p>
        </div>

        <div className="bg-white rounded-xl shadow-2xl border border-white/20 p-6">
          <h2 className="text-center font-bold text-foreground mb-1">Iniciar sesión</h2>
          <p className="text-center text-sm text-muted-foreground mb-5">
            Ingresa con tu usuario y contraseña
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="Ej: sabik.barreto"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-sm font-semibold text-destructive text-center">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={submitting || !username.trim() || !password}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Ingresar
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setMostrarAyuda((v) => !v)}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 mt-3 transition-colors"
          >
            ¿Olvidaste tu contraseña?
          </button>

          {mostrarAyuda && (
            <div className="mt-3 rounded-md bg-muted/60 border border-border p-3 text-xs text-muted-foreground leading-relaxed">
              Escríbele al Comité Organizador para que te asigne una nueva. Una vez entres, puedes
              cambiarla tú mismo desde el menú, en <span className="font-semibold">Cambiar mi contraseña</span>.
            </div>
          )}

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-muted-foreground">o</span>
            </div>
          </div>

          <Button type="button" variant="outline" className="w-full" onClick={loginPublico}>
            Entrar como Público (sin cuenta)
          </Button>
        </div>

        <p className="text-center text-white/60 text-xs mt-6">
          Cartagena · Torneo Socorro Senior Master Plus 40
        </p>
      </div>
    </div>
  )
}
