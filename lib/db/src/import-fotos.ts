/**
 * Carga las fotos de carné de los jugadores desde la carpeta de staging
 * (src/data/fotos-staging/), donde cada archivo se llama "<nCarnet>.<ext>".
 *
 * Uso:  pnpm db:import-fotos
 *
 * Las fotos originales pesan varios MB cada una (vienen directo de la
 * cámara), así que antes de guardarlas se redimensionan a un tamaño de
 * carné (máx. 480px de lado) y se comprimen a JPEG. Eso evita que la base
 * de datos crezca a varios GB y que la ficha del jugador tarde en cargar.
 *
 * No pisa la foto de un jugador que ya tenga una, para no perder una que
 * se haya subido a mano desde la aplicación. Es idempotente: se puede
 * volver a correr sin duplicar trabajo.
 *
 * La carpeta de staging NO se sube al repositorio (ver .gitignore): la
 * llena aparte un script que copia desde donde estén guardadas las fotos
 * originales, porque los contenedores de Docker no pueden ver unidades de
 * red o de Google Drive del host.
 */
import "./load-env-import";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { eq, isNull, sql } from "drizzle-orm";
import { db, jugadoresTable } from "./index";

const CARPETA = path.resolve(import.meta.dirname, "./data/fotos-staging");
const LADO_MAXIMO = 480;
const CALIDAD_JPEG = 82;

async function main() {
  let archivos: string[];
  try {
    archivos = readdirSync(CARPETA).filter((f) => /^\d+\.(jpg|jpeg|png)$/i.test(f));
  } catch {
    console.error(`No existe la carpeta ${CARPETA}.`);
    console.error("Corre primero el script que copia las fotos ahí (ver README).");
    process.exit(1);
  }

  console.log(`Archivos encontrados: ${archivos.length}`);
  if (archivos.length === 0) {
    console.log("Nada que importar.");
    return;
  }

  const jugadores = await db
    .select({ id: jugadoresTable.id, nCarnet: jugadoresTable.nCarnet, foto: jugadoresTable.foto })
    .from(jugadoresTable);
  const porCarnet = new Map(jugadores.filter((j) => j.nCarnet != null).map((j) => [String(j.nCarnet), j]));

  const resumen = { importadas: 0, yaTenianFoto: 0, sinJugador: 0, fallidas: [] as string[] };
  const tamanosOriginal: number[] = [];
  const tamanosFinal: number[] = [];

  for (const [i, archivo] of archivos.entries()) {
    const nCarnet = archivo.match(/^(\d+)\./)![1];
    const jugador = porCarnet.get(nCarnet);
    if (!jugador) {
      resumen.sinJugador++;
      continue;
    }
    if (jugador.foto) {
      resumen.yaTenianFoto++;
      continue;
    }

    const ruta = path.join(CARPETA, archivo);
    try {
      const original = readFileSync(ruta);
      tamanosOriginal.push(original.length);

      const redimensionada = await sharp(original)
        .rotate() // respeta la orientación EXIF de la cámara antes de recortar
        .resize(LADO_MAXIMO, LADO_MAXIMO, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: CALIDAD_JPEG })
        .toBuffer();
      tamanosFinal.push(redimensionada.length);

      const dataUrl = `data:image/jpeg;base64,${redimensionada.toString("base64")}`;
      await db.update(jugadoresTable).set({ foto: dataUrl }).where(eq(jugadoresTable.id, jugador.id));
      resumen.importadas++;
    } catch (err) {
      resumen.fallidas.push(`#${nCarnet}: ${err instanceof Error ? err.message : String(err)}`);
    }

    if ((i + 1) % 100 === 0 || i + 1 === archivos.length) {
      console.log(`  ${i + 1}/${archivos.length}`);
    }
  }

  const suma = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const promedio = (arr: number[]) => (arr.length ? suma(arr) / arr.length : 0);

  console.log("\n── Resultado ──");
  console.log(`  Fotos importadas:                 ${resumen.importadas}`);
  console.log(`  Jugadores que ya tenían foto:      ${resumen.yaTenianFoto} (no se tocaron)`);
  console.log(`  Números de carné sin jugador:      ${resumen.sinJugador}`);
  console.log(`  Fallidas:                          ${resumen.fallidas.length}`);
  if (tamanosOriginal.length) {
    console.log(
      `\n  Tamaño original promedio: ${(promedio(tamanosOriginal) / 1024).toFixed(0)} KB` +
        ` → comprimido: ${(promedio(tamanosFinal) / 1024).toFixed(0)} KB`,
    );
    console.log(`  Total agregado a la base: ${(suma(tamanosFinal) / 1e6).toFixed(1)} MB`);
  }
  if (resumen.fallidas.length) {
    console.log("\nFallidas:");
    for (const f of resumen.fallidas) console.log(`  ${f}`);
  }

  const [{ count: sinFoto }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jugadoresTable)
    .where(isNull(jugadoresTable.foto));
  console.log(`\nJugadores sin foto todavía: ${sinFoto} de ${jugadores.length}.`);
  console.log("\nListo.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
