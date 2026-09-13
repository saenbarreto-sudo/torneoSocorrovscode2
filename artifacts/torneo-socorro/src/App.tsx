import { useEffect, type ComponentType } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Login from '@/pages/login';
import { CambioObligatorio } from '@/components/cambio-obligatorio';
import { Route, Switch, Redirect, Router as WouterRouter, useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/app-layout';
import { AuthProvider, canAccessRoute, rutaInicial, useAuth } from '@/lib/auth';
import { ThemeProvider } from '@/components/theme-provider';
import { TemporadaProvider } from '@/lib/temporada';
import { Loader2 } from 'lucide-react';

import Dashboard from '@/pages/dashboard';
import TablasTorneo from '@/pages/tablas-torneo';
import Equipos from '@/pages/equipos';
import Jugadores from '@/pages/jugadores';
import FichaJugador from '@/pages/ficha-jugador';
import Arbitros from '@/pages/arbitros';
import FichaArbitro from '@/pages/ficha-arbitro';
import MiEquipo from '@/pages/mi-equipo';
import MisPartidos from '@/pages/mis-partidos';
import MiCuenta from '@/pages/mi-cuenta';
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

/**
 * Al entrar, lleva a cada quien a su primera pestaña: Dashboard el Comité y
 * el Administrador del sistema, "Mi equipo" el delegado.
 *
 * Hace falta porque la dirección sobrevive al cambio de sesión: quien salía
 * estando en "Mi equipo" y volvía a entrar con otro perfil se quedaba en la
 * pantalla del perfil anterior. Recargar la página NO dispara esto (ver
 * `recienIngreso` en lib/auth.tsx), para no sacar a nadie de donde está
 * trabajando.
 */
function LlevarASuInicio() {
  const { role, recienIngreso, ingresoAtendido } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!recienIngreso) return;
    navigate(rutaInicial(role), { replace: true });
    ingresoAtendido();
  }, [recienIngreso, role, navigate, ingresoAtendido]);

  return null;
}

function Router() {
  const { role } = useAuth();
  return (
    <AppLayout>
      <LlevarASuInicio />
      <Switch>
        {/* El delegado arranca en su equipo, no en el tablero del torneo. */}
        <Route path="/">{() => (role === 'delegado' ? <Redirect to={rutaInicial(role)} replace /> : <Dashboard />)}</Route>
        <Route path="/mi-equipo">{() => <Protected path="/mi-equipo" component={MiEquipo} />}</Route>
        <Route path="/mis-partidos">{() => <Protected path="/mis-partidos" component={MisPartidos} />}</Route>
        <Route path="/mi-cuenta">{() => <Protected path="/mi-cuenta" component={MiCuenta} />}</Route>
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
        <Route path="/arbitros">{() => <Protected path="/arbitros" component={Arbitros} />}</Route>
        <Route path="/arbitros/:id">{() => <Protected path="/arbitros" component={FichaArbitro} />}</Route>
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
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-sidebar">
        <Loader2 className="h-8 w-8 text-white animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return <Login />;
  // Entró con una contraseña temporal: hasta que no se ponga una propia no
  // ve nada más. El servidor tampoco le responde otra cosa, así que esto no
  // es lo que protege — es lo que lo explica.
  if (user?.debeCambiarPassword) return <CambioObligatorio />;
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
            <TemporadaProvider>
              <Gate />
            </TemporadaProvider>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
