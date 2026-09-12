import type { SemanaFecha, Partido } from '@workspace/api-client-react';
import { formatFechaConDia, formatHora12 } from '@/lib/utils';

/**
 * Cronograma de una semana, listo para imprimir o mandar por WhatsApp: se
 * usa tanto para la vista previa en pantalla (dentro del diálogo) como para
 * la copia que se imprime de verdad (ver components/imprimir-portal.tsx).
 * Mismo estilo de marca que el recibo de pago (components/recibo-pago.tsx):
 * colores fijos en HSL, no los tokens de tema, para que se vea igual sin
 * importar el modo oscuro/claro.
 */
export function ProgramacionImprimible({ semana, partidos }: { semana: SemanaFecha; partidos: Partido[] }) {
  const porFecha = new Map<string, Partido[]>();
  for (const p of partidos) {
    const clave = p.fecha ?? '';
    if (!porFecha.has(clave)) porFecha.set(clave, []);
    porFecha.get(clave)!.push(p);
  }
  const fechasOrdenadas = [...porFecha.keys()].sort();
  const [ano, mes, dia] = new Date().toISOString().slice(0, 10).split('-');
  for (const lista of porFecha.values()) {
    lista.sort((a, b) => (a.hora ?? '').localeCompare(b.hora ?? ''));
  }

  return (
    <div className="bg-white text-[hsl(273_45%_12%)] border border-[hsl(273_20%_85%)] rounded-lg overflow-hidden max-w-md mx-auto">
      {/* Mismo encabezado que el resto de lo imprimible (ver
          tabla-imprimible.tsx): grilla 1fr/auto/1fr para que el nombre quede
          centrado de verdad, con el escudo a la izquierda y la fecha de
          generación a la derecha. */}
      <div className="bg-[hsl(273_51%_32%)] text-white px-6 py-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <img
          src="/logo-torneo-socorro.png"
          alt="Escudo Torneo Socorro"
          className="h-14 w-14 object-contain shrink-0 justify-self-start"
        />
        <div className="text-center">
          <div className="font-extrabold text-lg leading-tight tracking-tight">TORNEO SOCORRO</div>
          <div className="text-xs text-white/80 tracking-wide">SENIOR MASTER PLUS 40</div>
          <div className="text-xs font-bold mt-1.5 bg-white/15 inline-block px-2 py-0.5 rounded">
            {semana.nombreSemana || `Fecha ${semana.semana}`}
            {semana.esFestivo && ' · Festivo'}
          </div>
        </div>
        <div className="text-right shrink-0 justify-self-end">
          <div className="text-[10px] text-white/70 uppercase tracking-wide">Generado</div>
          <div className="font-mono text-sm">{`${dia}/${mes}/${ano}`}</div>
        </div>
      </div>
      <div className="h-1.5 bg-[hsl(340_74%_27%)]" />

      <div className="px-6 py-5 space-y-5">
        {fechasOrdenadas.length === 0 ? (
          <p className="text-sm text-[hsl(273_15%_40%)]">Todavía no hay partidos con fecha para esta semana.</p>
        ) : (
          fechasOrdenadas.map((fecha) => (
            <div key={fecha || 'sin-fecha'} className="rounded-md overflow-hidden border border-[hsl(273_20%_82%)]">
              {/* Cada día con su barra, como los grupos del cuadro final. */}
              <div className="bg-[hsl(340_74%_27%)] text-white text-sm font-bold px-3 py-1.5">
                {fecha ? formatFechaConDia(fecha) : 'Sin fecha'}
              </div>
              <div>
                {porFecha.get(fecha)!.map((p, i) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between gap-3 text-sm px-3 py-2 ${
                      i % 2 === 1 ? 'bg-[hsl(273_40%_97%)]' : 'bg-white'
                    } ${i > 0 ? 'border-t border-[hsl(273_20%_90%)]' : ''}`}
                  >
                    <span className="font-mono text-xs w-20 shrink-0 whitespace-nowrap bg-[hsl(273_51%_94%)] text-[hsl(273_51%_32%)] font-bold rounded px-1.5 py-0.5 text-center">
                      {p.hora ? formatHora12(p.hora) : '—'}
                    </span>
                    <span className="flex-1 text-right font-semibold">{p.localNombre}</span>
                    <span className="text-[hsl(340_74%_40%)] text-xs font-bold shrink-0">vs</span>
                    <span className="flex-1 font-semibold">{p.visitanteNombre}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <p className="text-[10px] text-[hsl(273_15%_50%)] text-center px-6 pb-4">
        Torneo Socorro Senior Master Plus 40 · Cronograma sujeto a cambios por el Comité.
      </p>
    </div>
  );
}
