import { useEffect, type ComponentType } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Login from '@/pages/login';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/app-layout';
import { AuthProvider, canAccessRoute, useAuth } from '@/lib/auth';
import { ThemeProvider } from '@/components/theme-provider';
import { Loader2 } from 'lucide-react';

import Dashboard from '@/pages/dashboard';
import Posiciones from '@/pages/posiciones';
import Equipos from '@/pages/equipos';
import Jugadores from '@/pages/jugadores';
import FichaJugador from '@/pages/ficha-jugador';
import Partidos from '@/pages/partidos';
import Goleadores from '@/pages/goleadores';
import Vallas from '@/pages/vallas';
import Amonestados from '@/pages/amonestados';
import Pagos from '@/pages/pagos';
import PagosResumen from '@/pages/pagos-resumen';
import Egresos from '@/pages/egresos';
import Programacion from '@/pages/programacion';
import Usuarios from '@/pages/usuarios';

const queryClient = new QueryClient();

/**
 * Envuelve cada página: si el rol activo no tiene permiso para esta ruta,
 * navega directamente a la opción permitida más cercana (Dashboard) sin
 * mostrar ningún mensaje de error intermedio.
 */
function Protected({ path, component: Component }: { path: string; component: ComponentType }) {
  const { role } = useAuth();
  const [, navigate] = useLocation();
  const allowed = canAccessRoute(role, path);

  useEffect(() => {
    if (!allowed) navigate('/', { replace: true });
  }, [allowed, navigate]);

  if (!allowed) return null;
  return <Component />;
}

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/posiciones">{() => <Protected path="/posiciones" component={Posiciones} />}</Route>
        <Route path="/equipos">{() => <Protected path="/equipos" component={Equipos} />}</Route>
        <Route path="/jugadores">{() => <Protected path="/jugadores" component={Jugadores} />}</Route>
        <Route path="/jugadores/:id">{() => <Protected path="/jugadores" component={FichaJugador} />}</Route>
        <Route path="/partidos">{() => <Protected path="/partidos" component={Partidos} />}</Route>
        <Route path="/goleadores">{() => <Protected path="/goleadores" component={Goleadores} />}</Route>
        <Route path="/vallas">{() => <Protected path="/vallas" component={Vallas} />}</Route>
        <Route path="/amonestados">{() => <Protected path="/amonestados" component={Amonestados} />}</Route>
        <Route path="/pagos">{() => <Protected path="/pagos" component={Pagos} />}</Route>
        <Route path="/pagos/resumen">{() => <Protected path="/pagos/resumen" component={PagosResumen} />}</Route>
        <Route path="/egresos">{() => <Protected path="/egresos" component={Egresos} />}</Route>
        <Route path="/programacion">{() => <Protected path="/programacion" component={Programacion} />}</Route>
        <Route path="/usuarios">{() => <Protected path="/usuarios" component={Usuarios} />}</Route>
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Gate() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-sidebar">
        <Loader2 className="h-8 w-8 text-white animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return <Login />;
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Router />
    </WouterRouter>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <Gate />
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
