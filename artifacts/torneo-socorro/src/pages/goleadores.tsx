import { useGetGoleadores } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Medal, Goal, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ImprimirPortal } from '@/components/imprimir-portal';
import { TablaImprimible } from '@/components/tabla-imprimible';
import { useImprimir } from '@/hooks/use-imprimir';
import { useAuth, puedeImprimir } from '@/lib/auth';
import { NombreEquipo } from '@/components/nombre-equipo';

/** `embebido`: va dentro de Tablas del torneo (ver pages/tablas-torneo.tsx), donde el título va compacto. */
export default function Goleadores({ embebido = false }: { embebido?: boolean }) {
  const { data: goleadores, isLoading } = useGetGoleadores();
  const { imprimiendo, imprimir } = useImprimir();

  // El invitado consulta, no imprime (ver puedeImprimir en lib/auth.tsx).
  const { role } = useAuth();
  const botonImprimir = puedeImprimir(role) ? (
    <Button variant="ghost" size="icon" onClick={imprimir} aria-label="Imprimir goleadores">
      <Printer className="h-4 w-4" />
    </Button>
  ) : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {embebido ? (
        <div className="flex items-center gap-2">
          <Goal className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold tracking-tight">Goleadores</h2>
          <span className="ml-auto">{botonImprimir}</span>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 text-primary rounded-lg">
            <Goal className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Tabla de Goleadores</h1>
            <p className="text-muted-foreground mt-1">Los máximos artilleros del torneo</p>
          </div>
          <span className="ml-auto">{botonImprimir}</span>
        </div>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table variant="torneo">
            <TableHeader>
              <TableRow className="bg-sidebar text-sidebar-foreground hover:bg-sidebar">
                <TableHead className="w-16 text-center text-sidebar-foreground">Pos</TableHead>
                <TableHead className="text-sidebar-foreground">Jugador</TableHead>
                <TableHead className="text-sidebar-foreground">Equipo</TableHead>
                <TableHead className="text-right font-mono text-secondary font-black text-lg text-sidebar-foreground">Goles</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-10">Cargando...</TableCell>
                </TableRow>
              ) : goleadores?.map((goleador, idx) => (
                <TableRow key={`${goleador.jugadorId}-${goleador.equipoNombre}`} className={idx < 3 ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}>
                  <TableCell className="text-center font-mono font-bold text-lg">
                    {idx === 0 ? <Medal className="h-6 w-6 mx-auto text-yellow-500" /> : 
                     idx === 1 ? <Medal className="h-6 w-6 mx-auto text-gray-400" /> : 
                     idx === 2 ? <Medal className="h-6 w-6 mx-auto text-amber-700" /> : 
                     idx + 1}
                  </TableCell>
                  <TableCell className="font-bold text-base">{goleador.jugadorNombre}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      <NombreEquipo nombre={goleador.equipoNombre} />
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono font-black text-primary text-2xl">{goleador.totalGoles}</TableCell>
                </TableRow>
              ))}
              {!isLoading && goleadores?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                    Los goles se registran al cargar el resultado de cada partido.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ImprimirPortal activo={imprimiendo}>
        <TablaImprimible
          titulo="TABLA DE GOLEADORES"
          columnas={[
            { encabezado: 'Pos', alineacion: 'centro' },
            { encabezado: 'Jugador' },
            { encabezado: 'Equipo' },
            { encabezado: 'Goles', alineacion: 'derecha' },
          ]}
          filas={(goleadores ?? []).map((g, idx) => ({
            clave: `${g.jugadorId}-${g.equipoNombre}`,
            destacada: idx < 3,
            celdas: [idx + 1, g.jugadorNombre, g.equipoNombre, g.totalGoles],
          }))}
        />
      </ImprimirPortal>
    </div>
  );
}
