import * as React from 'react';
import { useCambiarPassword } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { KeyRound, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { extractErrorMessage } from '@/lib/api-errors';

/** El mismo mínimo que exige el servidor (ver api-server/src/lib/password.ts). */
const MINIMO = 8;

/**
 * La pantalla que ve quien entra con una contraseña temporal.
 *
 * Ocupa todo: no es un diálogo que se cierra con Escape ni algo que se pueda
 * saltar navegando a otra dirección. Y no es solo apariencia — mientras la
 * marca esté puesta, el servidor tampoco le responde nada que no sea esto
 * (ver require-auth.ts). La razón es que la contraseña con la que entró se la
 * dio otra persona: hasta que no se ponga una propia, su cuenta no es suya.
 */
export function CambioObligatorio() {
  const { user, logout, sesionActualizada } = useAuth();
  const cambiar = useCambiarPassword();

  const [actual, setActual] = React.useState('');
  const [nueva, setNueva] = React.useState('');
  const [confirmacion, setConfirmacion] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (nueva.length < MINIMO) {
      setError(`La contraseña nueva debe tener al menos ${MINIMO} caracteres.`);
      return;
    }
    if (nueva !== confirmacion) {
      setError('La confirmación no coincide con la contraseña nueva.');
      return;
    }

    try {
      await cambiar.mutateAsync({ passwordActual: actual, passwordNueva: nueva });
      // El servidor ya quitó la marca; se vuelve a preguntar quién es uno
      // para que la aplicación se entere y lo deje pasar.
      await sesionActualizada();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-sidebar p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-primary/10 text-primary rounded-lg shrink-0">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">Ponte tu contraseña</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {user ? `Hola, ${user.nombre}. ` : ''}
                La contraseña con la que entraste es temporal y la conoce quien te creó la cuenta. Ponte
                una propia para continuar.
              </p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="obl-actual">Contraseña temporal</Label>
              <Input
                id="obl-actual"
                type="password"
                autoComplete="current-password"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                placeholder="La que te pasaron"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="obl-nueva">Tu contraseña nueva</Label>
              <Input
                id="obl-nueva"
                type="password"
                autoComplete="new-password"
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                placeholder="Al menos 8 caracteres"
                required
              />
              <p className="text-xs text-muted-foreground">
                Lo más fácil de recordar son tres palabras seguidas, como{' '}
                <span className="font-mono">mi perro come arroz</span>. No puede ser solo números.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="obl-confirmacion">Repítela</Label>
              <Input
                id="obl-confirmacion"
                type="password"
                autoComplete="new-password"
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="text-sm font-medium text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={cambiar.isPending}>
              {cambiar.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Guardar y entrar
            </Button>
          </form>

          {/* Salida para quien abrió la sesión de otro por error, o para
              quien prefiere hacerlo después: no puede seguir adentro, pero
              tampoco queda encerrado. */}
          <button
            type="button"
            onClick={logout}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Salir sin cambiarla
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
