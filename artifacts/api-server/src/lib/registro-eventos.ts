import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  eventosTable,
  usuariosTable,
  equiposTable,
  jugadoresTable,
  partidosTable,
  pagosTable,
  egresosTable,
  tarjetasTable,
  programacionTable,
  mesasTable,
  ajustesTable,
  type AccionEvento,
} from "@workspace/db";
import { logger } from "./logger";

/**
 * El registro de actividad: un solo "portero" que ve pasar todas las
 * peticiones que modifican datos y anota quién hizo qué.
 *
 * Se hace acá y no en cada ruta a propósito: son más de 30 acciones y
 * seguirán saliendo más, y a la larga siempre se olvida una. Con esto, lo
 * que se agregue mañana queda registrado sin que nadie se acuerde de
 * hacerlo.
 *
 * Reglas:
 *  - Solo se anotan los métodos que modifican (POST, PATCH, PUT, DELETE) y
 *    las entradas al sistema. Las consultas no se anotan: llenarían el
 *    registro de ruido sin aportar nada.
 *  - Solo se anota si la petición salió bien (respuesta 2xx). La excepción
 *    es el login: un intento fallido es justamente lo que interesa ver.
 *  - Si anotar falla, NO se rompe la petición: el registro es un apoyo, no
 *    puede tumbar el trabajo de la mesa un sábado.
 */

/** Campos que jamás se guardan en el registro, ni siquiera para comparar. */
const CAMPOS_OCULTOS = new Set([
  "password",
  "passwordActual",
  "passwordNueva",
  "passwordHash",
  "foto", // la foto de carnet viaja en base64 y pesa megas
]);

interface DatosCargados {
  nombre: string;
  datos: Record<string, unknown>;
}

interface Recurso {
  entidad: string;
  /** Cómo se nombra en la frase: "al jugador", "el equipo"... */
  etiqueta: string;
  /** Lee el registro ANTES de tocarlo, para poder decir qué cambió. */
  cargar?: (id: number) => Promise<DatosCargados | null>;
  /**
   * Para los recursos que son una sola fila y no llevan id en la ruta
   * (Ajustes es la única por ahora): de dónde leer el "antes".
   */
  idFijo?: number;
  /** Nombre técnico del campo → cómo se lee en pantalla. */
  campos?: Record<string, string>;
}

async function unaFila<T extends Record<string, unknown>>(
  filas: T[],
  nombre: (fila: T) => string,
): Promise<DatosCargados | null> {
  const fila = filas[0];
  if (!fila) return null;
  return { nombre: nombre(fila), datos: fila };
}

const RECURSOS: Record<string, Recurso> = {
  equipos: {
    entidad: "equipo",
    etiqueta: "el equipo",
    cargar: async (id) =>
      unaFila(await db.select().from(equiposTable).where(eq(equiposTable.id, id)), (e) => e.nombre),
    campos: { nombre: "nombre", activo: "activo", delegado: "delegado", telefono: "teléfono" },
  },
  jugadores: {
    entidad: "jugador",
    etiqueta: "al jugador",
    cargar: async (id) =>
      unaFila(await db.select().from(jugadoresTable).where(eq(jugadoresTable.id, id)), (j) => j.nombre),
    campos: {
      nombre: "nombre",
      cedula: "cédula",
      telefono: "teléfono",
      equipoId: "equipo",
      activo: "activo",
      nCarnet: "n° de carné",
      fechaNacimiento: "fecha de nacimiento",
    },
  },
  partidos: {
    entidad: "partido",
    etiqueta: "el partido",
    cargar: async (id) => {
      const [fila] = await db
        .select({
          partido: partidosTable,
          local: equiposTable.nombre,
        })
        .from(partidosTable)
        .leftJoin(equiposTable, eq(equiposTable.id, partidosTable.localId))
        .where(eq(partidosTable.id, id));
      if (!fila) return null;
      const [visitante] = await db
        .select({ nombre: equiposTable.nombre })
        .from(equiposTable)
        .where(eq(equiposTable.id, fila.partido.visitanteId));
      return {
        nombre: `${fila.local ?? "?"} vs ${visitante?.nombre ?? "?"}`,
        datos: fila.partido,
      };
    },
    campos: {
      fecha: "fecha",
      hora: "hora",
      semana: "fecha n°",
      fase: "fase",
      arbitro: "árbitro",
      golesLocal: "goles del local",
      golesVisitante: "goles del visitante",
      jugado: "jugado",
    },
  },
  pagos: {
    entidad: "pago",
    etiqueta: "el recibo",
    cargar: async (id) => {
      const [fila] = await db
        .select({ pago: pagosTable, equipo: equiposTable.nombre })
        .from(pagosTable)
        .leftJoin(equiposTable, eq(equiposTable.id, pagosTable.equipoId))
        .where(eq(pagosTable.id, id));
      if (!fila) return null;
      return {
        nombre: `${fila.pago.concepto} de ${fila.equipo ?? "?"} (${formatearPesos(fila.pago.monto)})`,
        datos: fila.pago,
      };
    },
    campos: { concepto: "concepto", monto: "monto", fecha: "fecha" },
  },
  egresos: {
    entidad: "egreso",
    etiqueta: "el egreso",
    cargar: async (id) =>
      unaFila(
        await db.select().from(egresosTable).where(eq(egresosTable.id, id)),
        (e) => `${e.descripcion} (${formatearPesos(e.valor)})`,
      ),
    campos: { descripcion: "descripción", categoria: "categoría", valor: "valor", fecha: "fecha" },
  },
  tarjetas: {
    entidad: "tarjeta",
    etiqueta: "la tarjeta",
    cargar: async (id) => {
      const [fila] = await db
        .select({ tarjeta: tarjetasTable, jugador: jugadoresTable.nombre })
        .from(tarjetasTable)
        .leftJoin(jugadoresTable, eq(jugadoresTable.id, tarjetasTable.jugadorId))
        .where(eq(tarjetasTable.id, id));
      if (!fila) return null;
      return { nombre: `${fila.tarjeta.tipo} de ${fila.jugador ?? "?"}`, datos: fila.tarjeta };
    },
    campos: { tipo: "tipo", fechasSancion: "fechas de sanción", pagada: "pagada", valor: "valor" },
  },
  programacion: {
    entidad: "programacion",
    etiqueta: "la programación",
    cargar: async (id) =>
      unaFila(
        await db.select().from(programacionTable).where(eq(programacionTable.id, id)),
        (p) => p.nombreSemana ?? `Fecha ${p.semana}`,
      ),
    campos: { nombreSemana: "nombre", fechaDesde: "desde", fechaHasta: "hasta", semana: "fecha n°" },
  },
  usuarios: {
    entidad: "usuario",
    etiqueta: "el usuario",
    cargar: async (id) =>
      unaFila(await db.select().from(usuariosTable).where(eq(usuariosTable.id, id)), (u) => u.nombre),
    campos: { nombre: "nombre", username: "usuario", rol: "rol", activo: "activo", password: "contraseña" },
  },
  goles: { entidad: "gol", etiqueta: "el gol" },
  fases: { entidad: "fase", etiqueta: "las fases" },
  mesas: {
    entidad: "mesa",
    etiqueta: "la mesa",
    cargar: async (id) =>
      unaFila(await db.select().from(mesasTable).where(eq(mesasTable.id, id)), (m) => formatearFecha(m.fecha)),
    campos: { estado: "estado" },
  },
  ajustes: {
    entidad: "ajustes",
    etiqueta: "los ajustes del torneo",
    // Tabla de una sola fila: el "antes" siempre sale de la fila 1.
    idFijo: 1,
    cargar: async () =>
      unaFila(await db.select().from(ajustesTable).where(eq(ajustesTable.id, 1)), () => "del torneo"),
    campos: {
      valorMesa: "mesa (por equipo)",
      valorCintaCapitan: "cinta de capitán",
      valorAmarilla: "tarjeta amarilla",
      valorRoja: "tarjeta roja",
      valorFofi: "FOFI",
      valorCarnet: "carné",
      valorTraspaso: "traspaso",
      valorMultaTorneosAnteriores: "multa de torneos anteriores",
      valorArbitrajePrimeraVuelta: "arbitraje primera vuelta",
      valorArbitrajeSegundaVuelta: "arbitraje segunda vuelta",
    },
  },
};

function formatearPesos(valor: number | null | undefined): string {
  if (valor == null) return "$0";
  return `$${valor.toLocaleString("es-CO")}`;
}

function formatearFecha(fecha: string | null | undefined): string {
  if (!fecha) return "sin fecha";
  const [ano, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Cómo se lee un valor suelto dentro del "antes → después". */
function mostrarValor(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "(vacío)";
  if (typeof valor === "boolean") return valor ? "sí" : "no";
  if (typeof valor === "number") return valor.toLocaleString("es-CO");
  const texto = String(valor);
  return texto.length > 80 ? `${texto.slice(0, 80)}…` : texto;
}

interface Cambio {
  campo: string;
  antes: string;
  despues: string;
}

/**
 * Compara lo que había con lo que se mandó y devuelve solo lo que de verdad
 * cambió. Se ignoran los campos que no vienen en la petición (no se
 * tocaron) y los que nunca se guardan (contraseñas, fotos).
 */
function calcularCambios(
  antes: Record<string, unknown> | undefined,
  enviado: Record<string, unknown>,
  recurso: Recurso,
): Cambio[] {
  const cambios: Cambio[] = [];
  for (const [clave, valorNuevo] of Object.entries(enviado)) {
    if (CAMPOS_OCULTOS.has(clave)) continue;
    if (typeof valorNuevo === "object" && valorNuevo !== null) continue; // listas y objetos no se comparan campo a campo
    const etiqueta = recurso.campos?.[clave];
    if (!etiqueta) continue; // solo se reportan los campos que sabemos nombrar

    const valorViejo = antes?.[clave];
    const iguales =
      valorViejo === valorNuevo ||
      (valorViejo == null && (valorNuevo == null || valorNuevo === "")) ||
      String(valorViejo ?? "") === String(valorNuevo ?? "");
    if (iguales) continue;

    cambios.push({ campo: etiqueta, antes: mostrarValor(valorViejo), despues: mostrarValor(valorNuevo) });
  }
  return cambios;
}

/** Del path "/jugadores/12" saca { recurso: "jugadores", id: 12, resto: [] }. */
function partirRuta(path: string) {
  const partes = path.split("/").filter(Boolean);
  const recurso = partes[0] ?? "";
  const posibleId = Number(partes[1]);
  return {
    recurso,
    id: Number.isFinite(posibleId) ? posibleId : null,
    segundo: partes[1] ?? null,
    resto: partes.slice(2),
  };
}

function accionSegunMetodo(metodo: string): AccionEvento {
  if (metodo === "POST") return "crear";
  if (metodo === "DELETE") return "borrar";
  return "editar";
}

async function nombreDelUsuario(usuarioId: number | undefined): Promise<string | null> {
  if (!usuarioId) return null;
  const [usuario] = await db
    .select({ nombre: usuariosTable.nombre })
    .from(usuariosTable)
    .where(eq(usuariosTable.id, usuarioId));
  return usuario?.nombre ?? null;
}

/**
 * Arma la frase que se lee en pantalla. Los casos especiales (planilla,
 * lote de partidos, mesa, login) se describen aparte porque "editó el
 * partido" no diría lo que de verdad pasó.
 */
function armarDescripcion(opciones: {
  accion: AccionEvento;
  recurso: Recurso;
  nombreAntes: string | null;
  nombreDespues: string | null;
  ruta: ReturnType<typeof partirRuta>;
  cuerpo: Record<string, unknown>;
  respuesta: unknown;
}): string {
  const { accion, recurso, nombreAntes, nombreDespues, ruta, cuerpo, respuesta } = opciones;
  const nombre = nombreDespues ?? nombreAntes;

  // ── Casos especiales ──
  if (ruta.recurso === "partidos" && ruta.resto[0] === "planilla") {
    return `Llenó la planilla de ${nombreAntes ?? "un partido"}`;
  }
  if (ruta.recurso === "partidos" && ruta.segundo === "lote") {
    const creados = (respuesta as { creados?: number })?.creados;
    return creados != null ? `Programó ${creados} partido(s)` : "Programó varios partidos";
  }
  if (ruta.recurso === "mesas" && ruta.resto[0] === "estado") {
    const estado = String(cuerpo.estado ?? "");
    return `${estado === "cerrada" ? "Cerró" : "Reabrió"} la mesa de ${nombreAntes ?? "un día"}`;
  }
  if (ruta.recurso === "mesas" && accion === "borrar") {
    // Borrar una mesa se lleva la plata del día: eso es lo que hay que dejar
    // anotado, no solo que "borró una fila".
    const r = respuesta as { pagosBorrados?: number; egresosBorrados?: number } | undefined;
    const movimientos = (r?.pagosBorrados ?? 0) + (r?.egresosBorrados ?? 0);
    const dia = nombreAntes ?? "un día";
    return movimientos > 0
      ? `Borró la mesa de ${dia} y con ella ${movimientos} movimiento(s) de plata`
      : `Borró la mesa de ${dia}`;
  }
  if (ruta.recurso === "mesas") {
    return `Guardó la mesa del ${formatearFecha(ruta.segundo)}`;
  }
  if (ruta.recurso === "fases") {
    return "Registró las fases del torneo";
  }
  if (ruta.recurso === "ajustes") {
    return "Cambió los valores del torneo";
  }

  const verbo = accion === "crear" ? "Creó" : accion === "borrar" ? "Borró" : "Editó";
  return nombre ? `${verbo} ${recurso.etiqueta} ${nombre}` : `${verbo} ${recurso.etiqueta}`;
}

async function anotar(evento: {
  usuarioId: number | null;
  usuarioNombre: string;
  accion: AccionEvento;
  entidad: string;
  entidadId: number | null;
  descripcion: string;
  cambios: Cambio[];
}) {
  await db.insert(eventosTable).values({
    usuarioId: evento.usuarioId,
    usuarioNombre: evento.usuarioNombre,
    accion: evento.accion,
    entidad: evento.entidad,
    entidadId: evento.entidadId,
    descripcion: evento.descripcion,
    cambios: evento.cambios.length > 0 ? evento.cambios : null,
  });
}

export function registroDeEventos() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const metodo = req.method.toUpperCase();
    const esMutacion = metodo === "POST" || metodo === "PATCH" || metodo === "PUT" || metodo === "DELETE";
    if (!esMutacion) {
      next();
      return;
    }

    const ruta = partirRuta(req.path);
    const cuerpo = (req.body ?? {}) as Record<string, unknown>;

    // La respuesta se guarda al vuelo: de ahí sale el nombre de lo recién
    // creado y el resultado de los lotes.
    let respuesta: unknown;
    const jsonOriginal = res.json.bind(res);
    res.json = (cuerpoRespuesta: unknown) => {
      respuesta = cuerpoRespuesta;
      return jsonOriginal(cuerpoRespuesta);
    };

    // El "antes" hay que leerlo ahora: después de que el handler corra, un
    // registro borrado ya no existe y uno editado ya perdió su valor viejo.
    const recurso = RECURSOS[ruta.recurso];
    const idAnterior = ruta.id ?? recurso?.idFijo ?? null;
    const modifica = metodo === "PATCH" || metodo === "DELETE" || metodo === "PUT";
    const antesPromesa: Promise<DatosCargados | null> =
      modifica && idAnterior != null && recurso?.cargar
        ? recurso.cargar(idAnterior).catch(() => null)
        : Promise.resolve(null);

    res.on("finish", () => {
      // Anotar nunca puede tumbar la petición: ya se respondió, y cualquier
      // problema acá se queda en el log del servidor.
      void (async () => {
        try {
          const exito = res.statusCode >= 200 && res.statusCode < 300;

          // ── Entradas al sistema ──
          if (ruta.recurso === "auth" && ruta.segundo === "login") {
            const usuarioIntentado = String(cuerpo.username ?? "").trim() || "(sin usuario)";
            if (exito) {
              const usuario = (respuesta as { user?: { id: number; nombre: string } })?.user;
              await anotar({
                usuarioId: usuario?.id ?? null,
                usuarioNombre: usuario?.nombre ?? usuarioIntentado,
                accion: "ingreso",
                entidad: "sesion",
                entidadId: usuario?.id ?? null,
                descripcion: "Entró al sistema",
                cambios: [],
              });
            } else {
              await anotar({
                usuarioId: null,
                usuarioNombre: usuarioIntentado,
                accion: "ingreso_fallido",
                entidad: "sesion",
                entidadId: null,
                descripcion: `Intento de entrada fallido (usuario "${usuarioIntentado}")`,
                cambios: [],
              });
            }
            return;
          }

          if (!exito) return;

          const usuarioId = req.user?.sub ?? null;
          const nombreUsuario = (await nombreDelUsuario(req.user?.sub)) ?? req.user?.username ?? "(desconocido)";

          // ── Cambio de la propia contraseña ──
          if (ruta.recurso === "auth" && ruta.segundo === "password") {
            await anotar({
              usuarioId,
              usuarioNombre: nombreUsuario,
              accion: "editar",
              entidad: "usuario",
              entidadId: usuarioId,
              descripcion: "Cambió su propia contraseña",
              cambios: [],
            });
            return;
          }

          if (!recurso) return; // ruta no catalogada: no se inventa una frase

          const antes = await antesPromesa;
          // Para lo recién creado, el nombre sale de la respuesta.
          const cuerpoRespuesta = respuesta as Record<string, unknown> | undefined;
          const nombreDespues =
            typeof cuerpoRespuesta?.nombre === "string" ? cuerpoRespuesta.nombre : null;

          const accion = accionSegunMetodo(metodo);
          const cambios = accion === "editar" ? calcularCambios(antes?.datos, cuerpo, recurso) : [];

          // Cambiarle la contraseña a otro se anota explícitamente: el campo
          // nunca se guarda, pero que pasó sí tiene que quedar.
          if (ruta.recurso === "usuarios" && cuerpo.password) {
            cambios.push({ campo: "contraseña", antes: "(oculta)", despues: "(nueva)" });
          }

          const idEntidad =
            ruta.id ?? (typeof cuerpoRespuesta?.id === "number" ? cuerpoRespuesta.id : null);

          await anotar({
            usuarioId,
            usuarioNombre: nombreUsuario,
            accion,
            entidad: recurso.entidad,
            entidadId: idEntidad,
            descripcion: armarDescripcion({
              accion,
              recurso,
              nombreAntes: antes?.nombre ?? null,
              nombreDespues,
              ruta,
              cuerpo,
              respuesta,
            }),
            cambios,
          });
        } catch (err) {
          logger.error({ err, path: req.path }, "No se pudo anotar el evento en el registro de actividad");
        }
      })();
    });

    next();
  };
}
