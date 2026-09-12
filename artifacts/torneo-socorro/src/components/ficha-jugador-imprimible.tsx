import type { Jugador, JugadorHistorialEquipo } from '@workspace/api-client-react';
import { formatFecha } from '@/lib/utils';

/**
 * Ficha completa del jugador para imprimir: foto, datos personales,
 * carnetización y trayectoria por equipo. Mismo patrón que el recibo de
 * pago y los extractos (components/recibo-pago.tsx,
 * extracto-equipo.tsx/extracto-jugador.tsx): colores fijos en HSL, no los
 * tokens de tema, para que se vea igual sin importar el modo oscuro/claro.
 */
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

function edadEnElAno(fechaNacimiento: string): number {
  return new Date().getFullYear() - new Date(fechaNacimiento).getFullYear();
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-[hsl(273_15%_40%)] uppercase tracking-wide">{label}</div>
      <div className="text-sm font-semibold">{children}</div>
    </div>
  );
}

export function FichaJugadorImprimible({
  jugador,
  historial,
}: {
  jugador: Jugador;
  historial: JugadorHistorialEquipo[];
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const iniciales = jugador.nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const total = historial.reduce(
    (acc, h) => ({
      pj: acc.pj + h.partidosJugados,
      goles: acc.goles + h.goles,
      amarillas: acc.amarillas + h.amarillas,
      rojas: acc.rojas + h.rojas,
    }),
    { pj: 0, goles: 0, amarillas: 0, rojas: 0 },
  );

  return (
    <div className="bg-white text-[hsl(273_45%_12%)] border border-[hsl(273_20%_85%)] rounded-lg overflow-hidden max-w-2xl mx-auto">
      {/* Encabezado: grilla 1fr/auto/1fr para que el nombre del torneo quede
          centrado de verdad. */}
      <div className="bg-[hsl(273_51%_32%)] text-white px-6 py-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <img
          src="/logo-torneo-socorro.png"
          alt="Escudo Torneo Socorro"
          className="h-14 w-14 object-contain shrink-0 justify-self-start"
        />
        <div className="text-center">
          <div className="font-extrabold text-lg leading-tight tracking-tight">TORNEO SOCORRO</div>
          <div className="text-xs text-white/80 tracking-wide">SENIOR MASTER PLUS 40</div>
          <div className="text-xs font-bold mt-1.5 bg-white/15 inline-block px-2 py-0.5 rounded">
            FICHA DE JUGADOR
          </div>
        </div>
        <div className="text-right shrink-0 justify-self-end">
          <div className="text-[10px] text-white/70 uppercase tracking-wide">Generado</div>
          <div className="font-mono text-sm">{formatFecha(hoy)}</div>
        </div>
      </div>
      <div className="h-1.5 bg-[hsl(340_74%_27%)]" />

      <div className="px-6 py-5 space-y-5">
        {/* Foto y datos principales */}
        <div className="flex gap-4 items-start">
          <div className="w-20 h-24 rounded-md overflow-hidden shrink-0 border border-[hsl(273_20%_85%)] bg-[hsl(273_51%_97%)] flex items-center justify-center text-[hsl(273_15%_40%)]">
            {jugador.foto ? (
              <img src={jugador.foto} alt={jugador.nombre} className="w-full h-full object-cover" />
            ) : (
              <span className="font-mono text-xl font-bold">{iniciales || '—'}</span>
            )}
          </div>
          <div className="flex-1">
            <div className="font-bold text-lg leading-tight">{jugador.nombre}</div>
            <div className="text-sm text-[hsl(273_15%_40%)] font-mono mt-0.5">
              C.C. {formatCedula(jugador.cedula)}
              {jugador.fechaNacimiento && ` · ${edadEnElAno(jugador.fechaNacimiento)} años`}
            </div>
            <div className="flex flex-wrap gap-2 mt-2 text-xs">
              <span className={`inline-block px-2 py-0.5 rounded font-bold ${jugador.activo ? 'bg-green-100 text-green-800' : 'bg-[hsl(273_20%_92%)] text-[hsl(273_15%_40%)]'}`}>
                {jugador.activo ? 'Activo' : 'Inactivo'}
              </span>
              {jugador.nCarnet != null && (
                <span className="inline-block px-2 py-0.5 rounded font-bold border border-[hsl(273_20%_80%)]">
                  Carné N.º {jugador.nCarnet}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Datos personales */}
        <div>
          <div className="text-xs font-bold uppercase tracking-wide border-b border-[hsl(273_20%_88%)] pb-1 mb-2 text-[hsl(340_74%_27%)]">
            Datos personales
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Dato label="Fecha de nacimiento">{formatFecha(jugador.fechaNacimiento)}</Dato>
            <Dato label="Registro en la base">{formatFecha(jugador.createdAt)}</Dato>
            <Dato label="Equipo actual">{jugador.equipoNombre}</Dato>
            <Dato label="Último equipo anterior">
              {jugador.ultimoEquipoNombre || '—'}
            </Dato>
          </div>
        </div>

        {/* Carnetización */}
        <div>
          <div className="text-xs font-bold uppercase tracking-wide border-b border-[hsl(273_20%_88%)] pb-1 mb-2 text-[hsl(340_74%_27%)]">
            Carnetización
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Dato label="N.º de carné">{jugador.nCarnet ?? '—'}</Dato>
            <Dato label="Fecha de la foto">{formatFecha(jugador.fechaFoto)}</Dato>
            <Dato label="Pagó carné">{jugador.carnetPagado ? 'Sí' : 'Pendiente'}</Dato>
            <Dato label="Fecha de pago">{formatFecha(jugador.carnetFechaPago)}</Dato>
            <Dato label="Valor pagado">{formatPesos(jugador.carnetValor)}</Dato>
            <Dato label="Entrega del carné">{formatFecha(jugador.carnetFechaEntrega)}</Dato>
            <Dato label="Quién lo recibió">{jugador.carnetQuienRecibio || '—'}</Dato>
          </div>
        </div>

        {/* Trayectoria por equipo */}
        <div>
          <div className="text-xs font-bold uppercase tracking-wide border-b border-[hsl(273_20%_88%)] pb-1 mb-2 text-[hsl(340_74%_27%)]">
            Trayectoria por equipo
          </div>
          {historial.length === 0 ? (
            <p className="text-sm text-[hsl(273_15%_40%)]">Sin historial todavía.</p>
          ) : (
            <div className="rounded-md overflow-hidden border border-[hsl(273_20%_82%)]">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[hsl(273_51%_32%)] text-white text-left text-[10px] uppercase tracking-wide">
                    <th className="py-1.5 px-2 font-bold">Equipo</th>
                    <th className="py-1.5 px-2 font-bold">Temporada</th>
                    <th className="py-1.5 px-2 text-center font-bold">PJ</th>
                    <th className="py-1.5 px-2 text-center font-bold">Goles</th>
                    <th className="py-1.5 px-2 text-center font-bold">Am.</th>
                    <th className="py-1.5 px-2 text-center font-bold">Roj.</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((h, i) => (
                    <tr
                      key={`${h.equipoId}-${h.temporada ?? 'actual'}`}
                      className={i % 2 === 1 ? 'bg-[hsl(273_40%_97%)]' : 'bg-white'}
                    >
                      <td className="py-1 px-2 font-semibold border-t border-[hsl(273_20%_90%)]">{h.equipoNombre}</td>
                      <td className="py-1 px-2 border-t border-[hsl(273_20%_90%)]">{h.temporada ?? 'Actual'}</td>
                      <td className="py-1 px-2 text-center font-mono border-t border-[hsl(273_20%_90%)]">{h.partidosJugados}</td>
                      <td className="py-1 px-2 text-center font-mono font-bold border-t border-[hsl(273_20%_90%)]">{h.goles}</td>
                      <td className="py-1 px-2 text-center font-mono border-t border-[hsl(273_20%_90%)]">{h.amarillas}</td>
                      <td className="py-1 px-2 text-center font-mono border-t border-[hsl(273_20%_90%)]">{h.rojas}</td>
                    </tr>
                  ))}
                  <tr className="bg-[hsl(340_74%_94%)] border-t-2 border-[hsl(340_74%_45%)] font-bold">
                    <td className="py-1.5 px-2">Total</td>
                    <td />
                    <td className="py-1.5 px-2 text-center font-mono">{total.pj}</td>
                    <td className="py-1.5 px-2 text-center font-mono">{total.goles}</td>
                    <td className="py-1.5 px-2 text-center font-mono">{total.amarillas}</td>
                    <td className="py-1.5 px-2 text-center font-mono">{total.rojas}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <p className="text-[10px] text-[hsl(273_15%_50%)] text-center px-6 pb-4">
        Torneo Socorro Senior Master Plus 40 · Ficha generada desde el sistema, sujeta a actualización.
      </p>
    </div>
  );
}
