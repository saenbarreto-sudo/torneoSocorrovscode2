import type { Tarjeta, Jugador } from '@workspace/api-client-react';
import { formatMoney, formatFecha } from '@/lib/utils';

const TIPO_LABEL: Record<string, string> = { amarilla: 'Amarilla', roja: 'Roja' };

/** Cédula con separador de miles, igual que en la ficha del jugador. */
function formatCedula(cedula: string | null | undefined): string {
  if (!cedula) return '—';
  const soloDigitos = cedula.replace(/\D/g, '');
  return soloDigitos ? soloDigitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : cedula;
}

/**
 * Extracto de tarjetas de un jugador: cuántas amarillas y rojas tiene, cuál
 * ya pagó y cuál le queda pendiente. Solo incluye los tipos de tarjeta que
 * el usuario marcó en el selector (ver pages/ficha-jugador.tsx).
 *
 * Mismo lenguaje visual que el recibo de pago y el extracto de equipo.
 */
export function ExtractoJugador({
  jugador,
  tarjetas,
  tipos,
}: {
  jugador: Jugador;
  /** Ya filtradas a este jugador y a los tipos elegidos. */
  tarjetas: Tarjeta[];
  tipos: Array<'amarilla' | 'roja'>;
}) {
  const pagadas = tarjetas.filter((t) => t.pagada);
  const pendientes = tarjetas.filter((t) => !t.pagada);
  const totalPagado = pagadas.reduce((acc, t) => acc + (t.valor ?? 0), 0);
  const totalPendiente = pendientes.reduce((acc, t) => acc + (t.valor ?? 0), 0);
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="bg-white text-[hsl(273_45%_12%)] border border-[hsl(273_20%_85%)] rounded-lg overflow-hidden max-w-2xl mx-auto">
      {/* Encabezado: grilla 1fr/auto/1fr para que el nombre quede centrado de
          verdad (las dos columnas de los costados miden lo mismo entre sí,
          sin importar cuánto contenido tenga cada una). */}
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
            EXTRACTO DE TARJETAS
          </div>
        </div>
        <div className="text-right shrink-0 justify-self-end">
          <div className="text-[10px] text-white/70 uppercase tracking-wide">Generado</div>
          <div className="font-mono text-sm">{formatFecha(hoy)}</div>
        </div>
      </div>
      <div className="h-1.5 bg-[hsl(340_74%_27%)]" />

      {/* Jugador */}
      <div className="px-6 pt-5">
        <div className="text-[11px] text-[hsl(273_15%_40%)] uppercase tracking-wide">Jugador</div>
        <div className="font-bold text-xl">{jugador.nombre}</div>
        <div className="text-sm text-[hsl(273_15%_40%)]">
          C.C. {formatCedula(jugador.cedula)} · {jugador.equipoNombre}
          {jugador.nCarnet != null && ` · Carné N.º ${jugador.nCarnet}`}
        </div>
        <div className="text-xs text-[hsl(273_15%_50%)] mt-1">
          Tipos incluidos: {tipos.map((t) => TIPO_LABEL[t]).join(', ')}
        </div>
      </div>

      {/* Resumen: pagado / pendiente */}
      <div className="mx-6 mt-4 grid grid-cols-2 gap-3">
        <div className="bg-[hsl(273_51%_97%)] border border-[hsl(273_20%_88%)] rounded-md px-4 py-3">
          <div className="text-[11px] text-[hsl(273_15%_40%)] uppercase tracking-wide">Pagado</div>
          <div className="font-mono font-extrabold text-lg text-green-700">{formatMoney(totalPagado)}</div>
        </div>
        <div className="bg-[hsl(340_74%_97%)] border border-[hsl(340_20%_88%)] rounded-md px-4 py-3">
          <div className="text-[11px] text-[hsl(273_15%_40%)] uppercase tracking-wide">Pendiente</div>
          <div className="font-mono font-extrabold text-lg text-[hsl(340_74%_27%)]">{formatMoney(totalPendiente)}</div>
        </div>
      </div>

      {/* Detalle de tarjetas */}
      <div className="px-6 py-5">
        {tarjetas.length === 0 ? (
          <p className="text-sm text-[hsl(273_15%_50%)] text-center py-6">
            No tiene tarjetas de los tipos elegidos.
          </p>
        ) : (
          <div className="rounded-md overflow-hidden border border-[hsl(273_20%_82%)]">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[hsl(273_51%_32%)] text-white text-left text-[11px] uppercase tracking-wide">
                  <th className="py-2 px-2 font-bold">Fecha</th>
                  <th className="py-2 px-2 font-bold">Semana</th>
                  <th className="py-2 px-2 font-bold">Tipo</th>
                  <th className="py-2 px-2 font-bold text-right">Valor</th>
                  <th className="py-2 px-2 font-bold text-right">Estado</th>
                </tr>
              </thead>
              <tbody>
                {tarjetas.map((t, i) => (
                  <tr key={t.id} className={i % 2 === 1 ? 'bg-[hsl(273_40%_97%)]' : 'bg-white'}>
                    <td className="py-1.5 px-2 font-mono border-t border-[hsl(273_20%_90%)]">{formatFecha(t.fecha)}</td>
                    <td className="py-1.5 px-2 font-mono border-t border-[hsl(273_20%_90%)]">{t.semana}</td>
                    <td className="py-1.5 px-2 border-t border-[hsl(273_20%_90%)]">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded font-semibold ${
                          t.tipo === 'roja'
                            ? 'bg-[hsl(0_72%_92%)] text-[hsl(0_72%_30%)]'
                            : 'bg-[hsl(45_90%_88%)] text-[hsl(35_80%_28%)]'
                        }`}
                      >
                        {TIPO_LABEL[t.tipo] ?? t.tipo}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono font-semibold border-t border-[hsl(273_20%_90%)]">{formatMoney(t.valor)}</td>
                    <td className="py-1.5 px-2 text-right border-t border-[hsl(273_20%_90%)]">
                      {t.pagada ? (
                        <span className="font-semibold text-green-700">Pagada</span>
                      ) : (
                        <span className="font-semibold text-[hsl(340_74%_27%)]">Pendiente</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[10px] text-[hsl(273_15%_50%)] text-center pb-4">
        Torneo Socorro Senior Master Plus 40 · Comprobante interno, no es factura de venta.
      </p>
    </div>
  );
}
