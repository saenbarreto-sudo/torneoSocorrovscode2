/**
 * Freno a la adivinanza de contraseñas en el login.
 *
 * Sin esto, una contraseña corta (las del torneo son de cuatro dígitos) se
 * prueba entera en segundos: no hay nada que impida mandar diez mil intentos
 * seguidos. Con esto, cinco fallos dejan la cuenta en pausa quince minutos,
 * y probar diez mil pasa a tomar semanas.
 *
 * Se cuenta por USUARIO y no por dirección IP a propósito: lo que hay que
 * proteger es la cuenta, y quien ataca puede cambiar de IP en cada intento.
 * El costo es que alguien podría dejar a un usuario en pausa a propósito
 * fallándole el login; en un torneo de nueve equipos eso es un problema
 * mucho menor que la cuenta abierta, y se resuelve esperando.
 *
 * Vive en memoria: al reiniciar la API los contadores arrancan de cero. Para
 * este tamaño alcanza; si algún día corre en varios servidores, esto tendría
 * que pasar a la base.
 */

const MAXIMO_FALLOS = 5;
const PAUSA_MS = 15 * 60 * 1000;
/** Si no falla de nuevo en este lapso, se le olvida lo anterior. */
const OLVIDO_MS = 15 * 60 * 1000;

interface Intentos {
  fallos: number;
  ultimoFallo: number;
  enPausaHasta: number;
}

const porUsuario = new Map<string, Intentos>();

function normalizar(username: string): string {
  return username.trim().toLowerCase();
}

/** Deja la tabla chica: saca lo que ya no sirve de nada. */
function limpiarViejos(ahora: number): void {
  for (const [clave, i] of porUsuario) {
    if (i.enPausaHasta <= ahora && ahora - i.ultimoFallo > OLVIDO_MS) porUsuario.delete(clave);
  }
}

/**
 * Segundos que faltan para poder volver a intentar, o null si puede pasar.
 */
export function segundosDePausa(username: string): number | null {
  const ahora = Date.now();
  limpiarViejos(ahora);
  const i = porUsuario.get(normalizar(username));
  if (!i || i.enPausaHasta <= ahora) return null;
  return Math.ceil((i.enPausaHasta - ahora) / 1000);
}

/** Suma un intento fallido y, si ya son muchos, deja la cuenta en pausa. */
export function registrarFallo(username: string): void {
  const ahora = Date.now();
  const clave = normalizar(username);
  const previo = porUsuario.get(clave);
  // Si el último fallo fue hace rato, se empieza a contar de nuevo: lo que
  // se persigue es la ráfaga de intentos, no un error suelto de hace días.
  const fallos = previo && ahora - previo.ultimoFallo <= OLVIDO_MS ? previo.fallos + 1 : 1;
  porUsuario.set(clave, {
    fallos,
    ultimoFallo: ahora,
    enPausaHasta: fallos >= MAXIMO_FALLOS ? ahora + PAUSA_MS : 0,
  });
}

/** Entró bien: se le borra el historial de fallos. */
export function olvidarFallos(username: string): void {
  porUsuario.delete(normalizar(username));
}

/** Cuántos intentos le quedan antes de la pausa. Para el mensaje de aviso. */
export function intentosRestantes(username: string): number {
  const i = porUsuario.get(normalizar(username));
  if (!i) return MAXIMO_FALLOS;
  return Math.max(0, MAXIMO_FALLOS - i.fallos);
}
