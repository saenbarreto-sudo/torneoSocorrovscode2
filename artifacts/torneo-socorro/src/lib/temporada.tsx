import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setTemporadaGetter } from '@workspace/api-client-react';
import { setTemporadaEnCurso } from '@/lib/auth';

/**
 * Qué torneo se está viendo.
 *
 * Normalmente es el torneo EN CURSO (`null`), que es lo que responde la API
 * cuando no se le pide nada. Al elegir un torneo ya cerrado ("2025-2026"),
 * TODAS las consultas de lectura pasan a traer los datos de ese año — la
 * inyección del parámetro se hace en un solo punto, en el customFetch del
 * cliente (ver setTemporadaGetter).
 *
 * Un torneo cerrado se ve en modo lectura: escribir siempre iría contra el
 * torneo en curso, así que mientras se consulta uno viejo se desactivan los
 * botones de crear/editar/borrar en toda la app (ver canWrite en auth.tsx).
 */

interface EstadoTemporada {
  /** null = torneo en curso. */
  temporada: string | null;
  /** true cuando se está viendo un torneo ya cerrado. */
  viendoTorneoCerrado: boolean;
  verTemporada: (temporada: string | null) => void;
}

const TemporadaContext = React.createContext<EstadoTemporada | undefined>(undefined);

const CLAVE = 'torneo-socorro.temporada';

function leerGuardada(): string | null {
  try {
    return sessionStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function TemporadaProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [temporada, setTemporada] = React.useState<string | null>(() => leerGuardada());

  // El getter se registra ANTES del primer render con datos (useMemo corre
  // durante el render, useEffect después), para que ninguna consulta salga
  // sin el parámetro cuando se recarga la página viendo un torneo viejo.
  const refTemporada = React.useRef(temporada);
  refTemporada.current = temporada;
  React.useMemo(() => {
    setTemporadaGetter(() => refTemporada.current);
    setTemporadaEnCurso(refTemporada.current === null);
  }, []);

  const verTemporada = React.useCallback(
    (nueva: string | null) => {
      refTemporada.current = nueva;
      setTemporada(nueva);
      setTemporadaEnCurso(nueva === null);
      try {
        if (nueva) sessionStorage.setItem(CLAVE, nueva);
        else sessionStorage.removeItem(CLAVE);
      } catch {
        // Modo incógnito o almacenamiento bloqueado: el cambio igual aplica
        // en esta pestaña, solo no sobrevive a una recarga.
      }
      // Cambió el torneo: lo que había en caché es de otro año.
      queryClient.clear();
    },
    [queryClient],
  );

  const valor = React.useMemo<EstadoTemporada>(
    () => ({ temporada, viendoTorneoCerrado: temporada !== null, verTemporada }),
    [temporada, verTemporada],
  );

  // El `key` remonta TODA la app al cambiar de torneo. Hace falta por dos
  // razones: las pantallas no consultan el contexto (miran canWrite, que es
  // una función suelta) y React conserva el subárbol cuando los hijos vienen
  // como prop, así que sin esto se quedaban dibujadas con el torneo
  // anterior. Además limpia de paso el estado de cada pantalla (pestaña
  // elegida, filtros), que era del otro año.
  return (
    <TemporadaContext.Provider value={valor}>
      <React.Fragment key={temporada ?? '__en_curso__'}>{children}</React.Fragment>
    </TemporadaContext.Provider>
  );
}

export function useTemporada(): EstadoTemporada {
  const ctx = React.useContext(TemporadaContext);
  if (!ctx) throw new Error('useTemporada debe usarse dentro de TemporadaProvider');
  return ctx;
}
