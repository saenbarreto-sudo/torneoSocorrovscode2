import { useEffect, type ComponentType } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Login from '@/pages/login';
import { Route, Switch, Redirect, Router as WouterRouter, useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/app-layout';
import { AuthProvider, canAccessRoute, useAuth } from '@/lib/auth';
import { ThemeProvider } from '@/components/theme-provider';
import { Loader2 } from 'lucide-react';

import Dashboard from '@/pages/dashboard';
import TablasTorneo from '@/pages/tablas-torneo';
import Equipos from '@/pages/equipos';
import Jugadores from '@/pages/jugadores';
import FichaJugador from '@/pages/ficha-jugador';
import Partidos from '@/pages/partidos';
import Amonestados from '@/pages/amonestados';
import Tesoreria from '@/pages/tesoreria';
import GenerarCalendario from '@/pages/generar-calendario';
import ArmarFase from '@/pages/armar-fase';
import Usuarios from '@/pages/usuarios';
import Ajustes from '@/pages/ajustes';

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
        <Route path="/tablas">{() => <Protected path="/tablas" component={TablasTorneo} />}</Route>
        {/* Posiciones, Goleadores y Valla eran tres páginas sueltas: ahora
            se ven juntas en "/tablas", pero se dejan redirigiendo para no
            romper un enlace o marcador guardado. */}
        <Route path="/posiciones"><Redirect to="/tablas" replace /></Route>
        <Route path="/goleadores"><Redirect to="/tablas" replace /></Route>
        <Route path="/vallas"><Redirect to="/tablas" replace /></Route>
        <Route path="/equipos">{() => <Protected path="/equipos" component={Equipos} />}</Route>
        <Route path="/jugadores">{() => <Protected path="/jugadores" component={Jugadores} />}</Route>
        <Route path="/jugadores/:id">{() => <Protected path="/jugadores" component={FichaJugador} />}</Route>
        <Route path="/partidos">{() => <Protected path="/partidos" component={Partidos} />}</Route>
        <Route path="/amonestados">{() => <Protected path="/amonestados" component={Amonestados} />}</Route>
        {/* El cronograma ahora es la primera pestaña de "/partidos"; la ruta
            vieja se deja redirigiendo para no romper enlaces guardados. */}
        <Route path="/programacion"><Redirect to="/partidos" replace /></Route>
        <Route path="/tesoreria">{() => <Protected path="/tesoreria" component={Tesoreria} />}</Route>
        {/* Rutas viejas de cuando Recibos, Estado de cuenta y Egresos eran
            tres páginas sueltas: ahora son pestañas de Tesorería, pero se
            dejan redirigiendo para no romper un enlace o marcador guardado. */}
        <Route path="/pagos"><Redirect to="/tesoreria" replace /></Route>
        <Route path="/pagos/resumen"><Redirect to="/tesoreria" replace /></Route>
        <Route path="/egresos"><Redirect to="/tesoreria" replace /></Route>
        <Route path="/programacion/generar">{() => <Protected path="/programacion" component={GenerarCalendario} />}</Route>
        <Route path="/programacion/armar-fase">{() => <Protected path="/programacion" component={ArmarFase} />}</Route>
        <Route path="/usuarios">{() => <Protected path="/usuarios" component={Usuarios} />}</Route>
        <Route path="/ajustes">{() => <Protected path="/ajustes" component={Ajustes} />}</Route>
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
