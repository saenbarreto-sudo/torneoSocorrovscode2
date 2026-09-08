import type { Pago, Equipo } from '@workspace/api-client-react';
import { formatMoney, formatFecha } from '@/lib/utils';
import { montoEnLetras } from '@/lib/numero-a-letras';
import { CONCEPTO_LABEL } from '@/lib/conceptos-pago';

/**
 * Recibo de caja para una transacción de pago: el diseño en sí. Se usa
 * tanto para la vista previa en pantalla (dentro del diálogo) como para la
 * copia que se imprime de verdad (ver components/imprimir-portal.tsx).
 * Los colores van escritos directo en HSL, no con los tokens de tema
 * (bg-primary, etc.): el recibo siempre se ve igual —fondo blanco, morado y
 * rojo del torneo— sin importar si la app está en modo oscuro.
 */
/** Lo que le queda debiendo el equipo por inscripción, a hoy (incluye este pago). */
export interface SaldoInscripcion {
  deudaTotal: number;
  pagado: number;
  saldo: number;
}

export function ReciboPago({
  pago,
  equipo,
  recibidoPor,
  saldoInscripcion,
}: {
  pago: Pago;
  equipo?: Equipo;
  recibidoPor?: string | null;
  /** Solo se muestra cuando el concepto del recibo es "Inscripcion". */
  saldoInscripcion?: SaldoInscripcion;
}) {
  const numero = pago.codigoRecibo ?? (pago.nRecibo ? `#${String(pago.nRecibo).padStart(4, '0')}` : '—');
  const mostrarSaldo = pago.concepto === 'Inscripcion' && saldoInscripcion != null;

  return (
    <div className="bg-white text-[hsl(273_45%_12%)] border border-[hsl(273_20%_85%)] rounded-lg overflow-hidden max-w-md mx-auto">
      {/* Encabezado */}
      <div className="bg-[hsl(273_51%_32%)] text-white px-6 py-5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <img
            src="/logo-torneo-socorro.png"
            alt="Escudo Torneo Socorro"
            className="h-14 w-14 object-contain shrink-0"
          />
          <div>
            <div className="font-extrabold text-lg leading-tight tracking-tight">TORNEO SOCORRO</div>
            <div className="text-xs text-white/80 tracking-wide">SENIOR MASTER PLUS 40</div>
            <div className="text-xs font-bold mt-1.5 bg-white/15 inline-block px-2 py-0.5 rounded">
              RECIBO DE CAJA
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] text-white/70 uppercase tracking-wide">Recibo N.º</div>
          <div className="font-mono font-extrabold text-lg tabular-nums">{numero}</div>
          <div className="text-[10px] text-white/70 uppercase tracking-wide mt-2">Fecha</div>
          <div className="font-mono text-sm">{formatFecha(pago.fecha)}</div>
        </div>
      </div>
      {/* Filete rojo */}
      <div className="h-1.5 bg-[hsl(340_74%_27%)]" />

      {/* Cuerpo */}
      <div className="px-6 py-5 space-y-4">
        <div>
          <div className="text-[11px] text-[hsl(273_15%_40%)] uppercase tracking-wide">Recibí de</div>
          <div className="font-bold text-lg">{pago.equipoNombre}</div>
          {equipo?.delegado && (
            <div className="text-sm text-[hsl(273_15%_40%)]">Delegado: {equipo.delegado}</div>
          )}
        </div>

        <div className="bg-[hsl(273_51%_97%)] border border-[hsl(273_20%_88%)] rounded-md px-4 py-3">
          <div className="text-[11px] text-[hsl(273_15%_40%)] uppercase tracking-wide">La suma de</div>
          <div className="flex items-baseline justify-between gap-3 mt-0.5">
            <div className="font-bold leading-snug">{montoEnLetras(pago.monto)}</div>
            <div className="font-mono font-extrabold text-xl tabular-nums text-[hsl(340_74%_27%)] shrink-0">
              {formatMoney(pago.monto)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] text-[hsl(273_15%_40%)] uppercase tracking-wide">Por concepto de</div>
            <div className="font-semibold">{CONCEPTO_LABEL[pago.concepto] ?? pago.concepto}</div>
          </div>
          {(pago.semana != null || pago.mes) && (
            <div>
              <div className="text-[11px] text-[hsl(273_15%_40%)] uppercase tracking-wide">
                {pago.semana != null ? 'Semana' : 'Mes'}
              </div>
              <div className="font-semibold">{pago.semana ?? pago.mes}</div>
            </div>
          )}
        </div>

        {mostrarSaldo && (
          <div className="border-t border-[hsl(273_20%_88%)] pt-3">
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
      </div>

      {/* Pie: recibido por y firma */}
      <div className="px-6 pb-5">
        <div className="border-t border-[hsl(273_20%_88%)] pt-4 flex items-end justify-between gap-6">
          <div>
            <div className="text-[11px] text-[hsl(273_15%_40%)] uppercase tracking-wide">Recibido por</div>
            <div className="font-semibold">{recibidoPor || '—'}</div>
          </div>
          <div className="text-center shrink-0">
            <div className="w-36 border-b border-[hsl(273_45%_12%)] h-6" />
            <div className="text-[10px] text-[hsl(273_15%_40%)] mt-0.5">Firma</div>
          </div>
        </div>
        <p className="text-[10px] text-[hsl(273_15%_50%)] text-center mt-4">
          Torneo Socorro Senior Master Plus 40 · Comprobante interno, no es factura de venta.
        </p>
      </div>
    </div>
  );
}
