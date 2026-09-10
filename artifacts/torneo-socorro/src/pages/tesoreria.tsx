import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getGetPagosQueryOptions, useGetEgresos, type Pago } from '@workspace/api-client-react';
import { useAuth, canAccessRoute } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Landmark, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import Pagos from '@/pages/pagos';
import PagosResumen from '@/pages/pagos-resumen';
import Egresos from '@/pages/egresos';

/**
 * Tesorería junta en una sola pantalla las tres vistas de plata del torneo:
 * los recibos (lo que entra), el estado de cuenta por equipo (lo que se
 * debe) y los egresos (lo que sale), más el saldo en caja arriba — que
 * antes no se veía en ningún lado, había que mirar dos pantallas y restar
 * a mano.
 *
 * Cada pestaña es la misma página de antes, renderizada con `embebido` para
 * que no repita su propio título. Los permisos NO cambian: cada pestaña
 * aparece solo si el rol ya tenía acceso a esa ruta (un delegado, por
 * ejemplo, sigue viendo únicamente el estado de cuenta de su equipo).
 */
type Pestana = 'recibos' | 'estado' | 'egresos';

export default function Tesoreria() {
  const { role } = useAuth();
  const veRecibos = canAccessRoute(role, '/pagos');
  const veEstado = canAccessRoute(role, '/pagos/resumen');
  const veEgresos = canAccessRoute(role, '/egresos');

  const pestanasDisponibles: Array<{ valor: Pestana; etiqueta: string }> = [
    ...(veRecibos ? [{ valor: 'recibos' as const, etiqueta: 'Recibos' }] : []),
    ...(veEstado ? [{ valor: 'estado' as const, etiqueta: 'Estado de cuenta' }] : []),
    ...(veEgresos ? [{ valor: 'egresos' as const, etiqueta: 'Egresos' }] : []),
  ];

  const [pestana, setPestana] = useState<Pestana>(pestanasDisponibles[0]?.valor ?? 'estado');

  // El saldo solo se muestra a quien ve las dos caras (ingresos y egresos):
  // un saldo a medias confundiría más de lo que ayuda.
  const veCajaCompleta = veRecibos && veEgresos;
  const { data: pagos } = useQuery<Pago[]>({ ...getGetPagosQueryOptions(), enabled: veCajaCompleta });
  const { data: egresos } = useGetEgresos({ query: { enabled: veCajaCompleta } });

  const totalIngresos = (pagos ?? []).reduce((suma, p) => suma + p.monto, 0);
  const totalEgresos = (egresos ?? []).reduce((suma, e) => suma + e.valor, 0);
  const saldo = totalIngresos - totalEgresos;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 text-primary rounded-lg">
          <Landmark className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Tesorería</h1>
          <p className="text-muted-foreground mt-1">
            {pestanasDisponibles.length > 1 ? 'Ingresos, deudas y gastos del torneo' : 'Estado de cuenta de los equipos'}
          </p>
        </div>
      </div>

      {veCajaCompleta && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-green-100 text-green-700 rounded-lg dark:bg-green-950 dark:text-green-400">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ingresos</p>
                <p className="font-mono font-bold text-lg">{formatMoney(totalIngresos)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-red-100 text-red-700 rounded-lg dark:bg-red-950 dark:text-red-400">
                <TrendingDown className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Egresos</p>
                <p className="font-mono font-bold text-lg">{formatMoney(totalEgresos)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-primary/10 text-primary rounded-lg">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Saldo en caja</p>
                <p className={`font-mono font-bold text-lg ${saldo < 0 ? 'text-destructive' : ''}`}>
                  {formatMoney(saldo)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {pestanasDisponibles.length > 1 && (
        <Tabs value={pestana} onValueChange={(v) => setPestana(v as Pestana)}>
          <TabsList>
            {pestanasDisponibles.map((p) => (
              <TabsTrigger key={p.valor} value={p.valor}>{p.etiqueta}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {pestana === 'recibos' && veRecibos && <Pagos embebido />}
      {pestana === 'estado' && veEstado && <PagosResumen embebido />}
      {pestana === 'egresos' && veEgresos && <Egresos embebido />}
    </div>
  );
}
