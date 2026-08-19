/**
 * Importa los equipos y jugadores reales del torneo desde la Base de Datos
 * de Carné (temporada 2025-2026), que vive en src/data/jugadores-2026.json.
 *
 * Uso:  pnpm db:import-jugadores
 *
 * Qué hace:
 *  1. Borra los jugadores que estén cargados actualmente (junto con sus
 *     goles, tarjetas y planillas, para no dejar registros huérfanos).
 *  2. Crea los equipos que falten (no toca los que ya existan).
 *  3. Inserta los 1.260 jugadores con cédula, nombre, fecha de nacimiento,
 *     número de carné y equipo.
 *
 * NO borra partidos, pagos ni usuarios.
 *
 * Los datos ya vienen depurados del Excel: cédulas duplicadas resueltas,
 * nombres de equipo unificados (por mayúsculas y tildes) y anotaciones
 * entre paréntesis retiradas de los nombres de equipo.
 */
import "./load-env-import";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "./index";
import { equiposTable, jugadoresTable } from "./schema";

interface JugadorImport {
  cedula: string;
  nombre: string;
  fechaNacimiento: string | null;
  equipo: string;
  nCarnet: number | null;
  _revisar?: string;
}

async function main() {
  const dataPath = path.resolve(import.meta.dirname, "./data/jugadores-2026.json");
  const { equipos, jugadores } = JSON.parse(readFileSync(dataPath, "utf-8")) as {
    equipos: string[];
    jugadores: JugadorImport[];
  };

  console.log(`Archivo leído: ${equipos.length} equipos, ${jugadores.length} jugadores.`);

  await db.transaction(async (tx) => {
    // 1. Limpiar jugadores actuales y todo lo que dependa de ellos.
    console.log("Borrando jugadores cargados actualmente...");
    // Los pagos que liquidan una tarjeta deben borrarse antes que la
    // tarjeta, porque la referencian. Se desligan en vez de borrarse,
    // para no perder recibos ya emitidos por el tesorero.
    await tx.execute(sql`UPDATE pagos SET tarjeta_id = NULL WHERE tarjeta_id IS NOT NULL`);
    await tx.execute(sql`DELETE FROM planilla`);
    await tx.execute(sql`DELETE FROM goles`);
    await tx.execute(sql`DELETE FROM tarjetas`);
    await tx.execute(sql`DELETE FROM jugadores`);

    // 2. Crear los equipos que falten.
    const existentes = await tx.select({ id: equiposTable.id, nombre: equiposTable.nombre }).from(equiposTable);
    const porNombre = new Map(existentes.map((e) => [e.nombre.trim().toLowerCase(), e.id]));

    const faltantes = equipos.filter((n) => !porNombre.has(n.trim().toLowerCase()));
    if (faltantes.length > 0) {
      const creados = await tx
        .insert(equiposTable)
        .values(faltantes.map((nombre) => ({ nombre, telefono: "Por definir" })))
        .returning({ id: equiposTable.id, nombre: equiposTable.nombre });
      for (const e of creados) porNombre.set(e.nombre.trim().toLowerCase(), e.id);
      console.log(`Equipos creados: ${creados.length}`);
    } else {
      console.log("Todos los equipos ya existían.");
    }

    // 3. Insertar jugadores.
    const filas = jugadores
      .map((j) => {
        const equipoId = porNombre.get(j.equipo.trim().toLowerCase());
        if (!equipoId) return null;
        return {
          cedula: j.cedula,
          nombre: j.nombre,
          fechaNacimiento: j.fechaNacimiento,
          equipoId,
          nCarnet: j.nCarnet,
          activo: true,
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    // Se inserta por lotes para no armar una sentencia gigante.
    const LOTE = 200;
    for (let i = 0; i < filas.length; i += LOTE) {
      await tx.insert(jugadoresTable).values(filas.slice(i, i + LOTE));
    }
    console.log(`Jugadores insertados: ${filas.length}`);
  });

  const porRevisar = jugadores.filter((j) => j._revisar);
  if (porRevisar.length > 0) {
    console.log("\nRevisar manualmente (quedaron sin fecha de nacimiento):");
    for (const j of porRevisar) console.log(`  - ${j.nombre} (${j.equipo}): ${j._revisar}`);
  }

  console.log("\nImportación terminada.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Falló la importación:", err);
  process.exit(1);
});
