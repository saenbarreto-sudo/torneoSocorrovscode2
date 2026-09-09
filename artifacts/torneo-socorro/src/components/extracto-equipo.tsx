import type { Pago, Equipo } from '@workspace/api-client-react';
import { formatMoney, formatFecha } from '@/lib/utils';
import { CONCEPTO_LABEL, type Concepto } from '@/lib/conceptos-pago';
import type { SaldoInscripcion } from './recibo-pago';

/**
 * Extracto de cuenta de un equipo: todos sus recibos de pago, agrupados por
 * concepto, con el subtotal de cada uno y el total general. Solo incluye
 * los conceptos que el usuario marcó en el selector (ver
 * pages/pagos-resumen.tsx), así que puede ser un extracto completo o de un
 * único concepto.
 *
 * Mismo lenguaje visual que el recibo de pago (components/recibo-pago.tsx):
 * colores fijos en HSL para que se vea igual en modo claro y oscuro, y en
 * el papel.
 */
export function ExtractoEquipo({
  equipo,
  pagos,
  conceptos,
  saldoInscripcion,
}: {
  equipo: Equipo;
  /** Ya filtrados a este equipo y a los conceptos elegidos. */
  pagos: Pago[];
  /** Los conceptos que se pidió incluir, en el orden en que se muestran. */
  conceptos: Concepto[];
  saldoInscripcion?: SaldoInscripcion;
}) {
  const total = pagos.reduce((acc, p) => acc + p.monto, 0);
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
            EXTRACTO DE CUENTA
          </div>
        </div>
        <div className="text-right shrink-0 justify-self-end">
          <div className="text-[10px] text-white/70 uppercase tracking-wide">Generado</div>
          <div className="font-mono text-sm">{formatFecha(hoy)}</div>
        </div>
      </div>
      <div className="h-1.5 bg-[hsl(340_74%_27%)]" />

      {/* Equipo */}
      <div className="px-6 pt-5">
        <div className="text-[11px] text-[hsl(273_15%_40%)] uppercase tracking-wide">Equipo</div>
        <div className="font-bold text-xl">{equipo.nombre}</div>
        {equipo.delegado && (
          <div className="text-sm text-[hsl(273_15%_40%)]">Delegado: {equipo.delegado}</div>
        )}
        <div className="text-xs text-[hsl(273_15%_50%)] mt-1">
          Conceptos incluidos: {conceptos.map((c) => CONCEPTO_LABEL[c]).join(', ')}
        </div>
      </div>

      {/* Saldo de inscripción, si ese concepto está incluido */}
      {saldoInscripcion && (
        <div className="mx-6 mt-4 bg-[hsl(273_51%_97%)] border border-[hsl(273_20%_88%)] rounded-md px-4 py-3">
          <div className="text-[11px] text-[hsl(273_15%_40%)] uppercase tracking-wide">Saldo de inscripción</div>
          <div className="flex items-baseline justify-between gap-3 mt-0.5">
            <span className="text-sm text-[hsl(273_15%_40%)]">
              Pagado {formatMoney(saldoInscripcion.pagado)} de {formatMoney(saldoInscripcion.deudaTotal)}
            </span>
            {saldoInscripcion.saldo <= 0 ? (
              <span className="font-bold text-green-700">Al día</span>
            ) : (
              <span className="font-mono font-bold text-[hsl(340_74%_27%)]">
                Saldo: {formatMoney(saldoInscripcion.saldo)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Detalle de pagos */}
      <div className="px-6 py-5">
        {pagos.length === 0 ? (
          <p className="text-sm text-[hsl(273_15%_50%)] text-center py-6">
            No hay recibos registrados para los conceptos elegidos.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[hsl(273_20%_85%)] text-left text-[11px] text-[hsl(273_15%_40%)] uppercase tracking-wide">
                <th className="py-2 font-semibold">Recibo</th>
                <th className="py-2 font-semibold">Fecha</th>
                <th className="py-2 font-semibold">Concepto</th>
                <th className="py-2 font-semibold text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((p) => (
                <tr key={p.id} className="border-b border-[hsl(273_20%_92%)]">
                  <td className="py-1.5 font-mono">{p.codigoRecibo ?? (p.nRecibo ? `#${String(p.nRecibo).padStart(4, '0')}` : '—')}</td>
                  <td className="py-1.5 font-mono">{formatFecha(p.fecha)}</td>
                  <td className="py-1.5">{CONCEPTO_LABEL[p.concepto] ?? p.concepto}</td>
                  <td className="py-1.5 text-right font-mono font-semibold">{formatMoney(p.monto)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="pt-3 font-bold">Total</td>
                <td className="pt-3 text-right font-mono font-extrabold text-lg text-[hsl(340_74%_27%)]">
                  {formatMoney(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <p className="text-[10px] text-[hsl(273_15%_50%)] text-center pb-4">
        Torneo Socorro Senior Master Plus 40 · Comprobante interno, no es factura de venta.
      </p>
    </div>
  );
}
