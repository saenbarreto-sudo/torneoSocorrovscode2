import { useMemo, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useGetJugador, useGetJugadorHistorial, useGetTarjetas } from '@workspace/api-client-react';
import { useAuth, canWrite } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Edit2, Printer, User } from 'lucide-react';
import { JugadorFormDialog } from '@/components/jugador-form-dialog';
import { ExtractoJugador } from '@/components/extracto-jugador';
import { ImprimirPortal } from '@/components/imprimir-portal';

const TIPOS_TARJETA = ['amarilla', 'roja'] as const;
const TIPO_LABEL: Record<string, string> = { amarilla: 'Amarillas', roja: 'Rojas' };

/** Edad que cumple el jugador dentro del año del torneo (Art. 10.1). */
function edadEnElAno(fechaNacimiento: string): number {
  return new Date().getFullYear() - new Date(fechaNacimiento).getFullYear();
}

function formatFecha(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  const [y, m, d] = fecha.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

/** Cédula con separador de miles, como se lee en el carné: 73.568.991 */
function formatCedula(cedula: string | null | undefined): string {
  if (!cedula) return '—';
  const soloDigitos = cedula.replace(/\D/g, '');
  if (!soloDigitos) return cedula;
  return soloDigitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatPesos(valor: number | null | undefined): string {
  if (valor == null) return '—';
  return `$${valor.toLocaleString('es-CO')}`;
}

/** Etiqueta + valor, el bloque que se repite en "Datos personales". */
function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className="text-sm font-semibold">{children}</div>
    </div>
  );
}

export default function FichaJugador() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { role } = useAuth();
  const puedeEditar = canWrite(role, 'jugadores');
  const jugadorId = Number(id);

  const { data: jugador, isLoading } = useGetJugador(jugadorId);
  const { data: historial } = useGetJugadorHistorial(jugadorId);
  const { data: tarjetas } = useGetTarjetas({ jugadorId });
  const [editOpen, setEditOpen] = useState(false);

  // ── Extracto imprimible de tarjetas ──────────────────────────────────────
  const [extractoOpen, setExtractoOpen] = useState(false);
  const [tiposExtracto, setTiposExtracto] = useState<Set<'amarilla' | 'roja'>>(new Set(TIPOS_TARJETA));

  const alternarTipoExtracto = (t: 'amarilla' | 'roja') => {
    setTiposExtracto((previo) => {
      const copia = new Set(previo);
      if (copia.has(t)) copia.delete(t);
      else copia.add(t);
      return copia;
    });
  };

  const tiposOrdenados = useMemo(() => TIPOS_TARJETA.filter((t) => tiposExtracto.has(t)), [tiposExtracto]);
  const tarjetasFiltradas = useMemo(
    () => (tarjetas ?? []).filter((t) => tiposExtracto.has(t.tipo)),
    [tarjetas, tiposExtracto],
  );

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground">Cargando...</div>;
  }

  if (!jugador) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Jugador no encontrado.
        <div className="mt-4">
          <Button variant="outline" onClick={() => navigate('/jugadores')}>Volver</Button>
        </div>
      </div>
    );
  }

  // El total de la trayectoria se calcula aquí (y no en el backend) porque
  // es solo la suma de las filas que ya se están mostrando.
  const total = (historial ?? []).reduce(
    (acc, h) => ({
      pj: acc.pj + h.partidosJugados,
      goles: acc.goles + h.goles,
      amarillas: acc.amarillas + h.amarillas,
      rojas: acc.rojas + h.rojas,
    }),
    { pj: 0, goles: 0, amarillas: 0, rojas: 0 },
  );

  const anioUltimoEquipo = jugador.ultimoEquipoFechaFin
    ? jugador.ultimoEquipoFechaFin.split('T')[0].split('-')[0]
    : null;

  const iniciales = jugador.nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-start gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/jugadores')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Ficha de Jugador</h1>
            <p className="text-muted-foreground mt-1">Perfil, carnetización e historial</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => setExtractoOpen(true)}>
            <Printer className="h-4 w-4 mr-2" /> Extracto
          </Button>
          {puedeEditar && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Edit2 className="h-4 w-4 mr-2" /> Editar
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-6 sm:p-8 space-y-8">
          {/* ── Encabezado: foto, nombre, cédula y carnés ── */}
          <div className="flex gap-6 items-start flex-wrap">
            <div className="w-28 h-32 rounded-md overflow-hidden shrink-0 border-2 border-dashed border-input bg-muted flex flex-col items-center justify-center gap-1 text-muted-foreground">
              {jugador.foto ? (
                <img src={jugador.foto} alt={jugador.nombre} className="w-full h-full object-cover" />
              ) : (
                <>
                  {iniciales ? (
                    <span className="font-mono text-2xl font-bold">{iniciales}</span>
                  ) : (
                    <User className="h-8 w-8" />
                  )}
                  <span className="text-[11px]">Foto</span>
                </>
              )}
            </div>

            <div className="flex-1 min-w-[260px]">
              <h2 className="text-2xl font-extrabold tracking-tight">{jugador.nombre}</h2>
              <p className="text-muted-foreground mt-0.5 font-mono text-sm">
                C.C. {formatCedula(jugador.cedula)}
                {jugador.fechaNacimiento && ` · ${edadEnElAno(jugador.fechaNacimiento)} años`}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge variant={jugador.activo ? 'success' : 'secondary'}>
                  {jugador.activo ? 'Activo' : 'Inactivo'}
                </Badge>
                {jugador.nCarnet != null && (
                  <Badge variant="outline" className="font-normal">
                    Carné N.º {jugador.nCarnet}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* ── Datos personales ── */}
          <div>
            <h3 className="text-sm font-bold mb-4 pb-2 border-b">Datos personales</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
              <Dato label="Fecha de nacimiento">{formatFecha(jugador.fechaNacimiento)}</Dato>
              <Dato label="Registro en la base">{formatFecha(jugador.createdAt)}</Dato>
              <Dato label="Equipo actual">{jugador.equipoNombre}</Dato>
              <Dato label="Último equipo anterior">
                {jugador.ultimoEquipoNombre ? (
                  <>
                    {jugador.ultimoEquipoNombre}
                    {anioUltimoEquipo && (
                      <span className="text-muted-foreground font-normal"> ({anioUltimoEquipo})</span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground font-normal">—</span>
                )}
              </Dato>
            </div>
          </div>

          {/* ── Carnetización ── */}
          <div>
            <h3 className="text-sm font-bold mb-4 pb-2 border-b">Carnetización</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
              <Dato label="N.º de carné">
                <span className="font-mono tabular-nums">{jugador.nCarnet ?? '—'}</span>
              </Dato>
              <Dato label="Fecha de la foto">
                <span className="font-mono tabular-nums">{formatFecha(jugador.fechaFoto)}</span>
              </Dato>
              <Dato label="Pagó carné">
                {jugador.carnetPagado ? (
                  <Badge variant="success">Sí</Badge>
                ) : (
                  <Badge variant="warning">Pendiente</Badge>
                )}
              </Dato>
              <Dato label="Fecha de pago">
                <span className="font-mono tabular-nums">{formatFecha(jugador.carnetFechaPago)}</span>
              </Dato>
              <Dato label="Valor pagado">
                <span className="font-mono tabular-nums">{formatPesos(jugador.carnetValor)}</span>
              </Dato>
              <Dato label="Entrega del carné">
                <span className="font-mono tabular-nums">{formatFecha(jugador.carnetFechaEntrega)}</span>
              </Dato>
              <Dato label="Quién lo recibió">
                {jugador.carnetQuienRecibio || <span className="text-muted-foreground font-normal">—</span>}
              </Dato>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Trayectoria por equipo ── */}
      <Card>
        <CardContent className="p-0">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-bold">Trayectoria por equipo</h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipo</TableHead>
                  <TableHead className="text-center">PJ</TableHead>
                  <TableHead className="text-center">Goles</TableHead>
                  <TableHead className="text-center">Amar.</TableHead>
                  <TableHead className="text-center">Rojas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!historial || historial.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                      Sin historial todavía
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {historial.map((h) => (
                      <TableRow key={h.equipoId}>
                        <TableCell className="font-semibold">
                          {h.equipoNombre}
                          {h.equipoId === jugador.equipoId && (
                            <span className="text-muted-foreground font-normal text-xs"> · actual</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-mono tabular-nums">{h.partidosJugados}</TableCell>
                        <TableCell className="text-center font-mono tabular-nums font-bold">{h.goles}</TableCell>
                        <TableCell className="text-center font-mono tabular-nums">{h.amarillas}</TableCell>
                        <TableCell className="text-center font-mono tabular-nums">{h.rojas}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 hover:bg-transparent">
                      <TableCell className="font-bold">Total</TableCell>
                      <TableCell className="text-center font-mono tabular-nums font-bold">{total.pj}</TableCell>
                      <TableCell className="text-center font-mono tabular-nums font-bold">{total.goles}</TableCell>
                      <TableCell className="text-center font-mono tabular-nums font-bold">{total.amarillas}</TableCell>
                      <TableCell className="text-center font-mono tabular-nums font-bold">{total.rojas}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <JugadorFormDialog open={editOpen} onOpenChange={setEditOpen} jugador={jugador} />

      {/* ── Extracto imprimible de tarjetas ── */}
      <Dialog open={extractoOpen} onOpenChange={setExtractoOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Extracto de {jugador.nombre}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap gap-x-5 gap-y-2 border-b pb-4">
            {TIPOS_TARJETA.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={tiposExtracto.has(t)} onCheckedChange={() => alternarTipoExtracto(t)} />
                {TIPO_LABEL[t]}
              </label>
            ))}
          </div>

          <ExtractoJugador jugador={jugador} tarjetas={tarjetasFiltradas} tipos={tiposOrdenados} />

          <DialogFooter>
            <Button variant="outline" onClick={() => setExtractoOpen(false)}>Cerrar</Button>
            <Button onClick={() => window.print()} disabled={tiposOrdenados.length === 0}>
              <Printer className="h-4 w-4 mr-2" /> Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImprimirPortal activo={extractoOpen}>
        <ExtractoJugador jugador={jugador} tarjetas={tarjetasFiltradas} tipos={tiposOrdenados} />
      </ImprimirPortal>
    </div>
  );
}

