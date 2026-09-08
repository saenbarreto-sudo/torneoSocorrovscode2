# Torneo Socorro Senior Master Plus 40

Aplicación para administrar el torneo: equipos, jugadores, fichas y carnés,
partidos, posiciones, goleadores, amonestados, pagos y egresos. Incluye inicio
de sesión con usuario y contraseña, con permisos por rol.

Este proyecto es un **monorepo pnpm**:

- `artifacts/torneo-socorro` → frontend (React + Vite + Tailwind)
- `artifacts/api-server` → backend (Express)
- `lib/db` → esquema y conexión a la base de datos (PostgreSQL + Drizzle ORM)
- `lib/api-spec` → contrato de la API (OpenAPI) del que se genera el resto
- `lib/api-client-react`, `lib/api-zod` → código generado a partir del contrato

> **Todo corre dentro de Docker**, incluidos el frontend y el backend. Las
> dependencias de npm nunca se instalan ni se ejecutan en tu computador: viven
> solo dentro de los contenedores. Ese aislamiento es a propósito, no lo
> deshagas corriendo `pnpm install` en la raíz.

---

## 1. Requisitos

- **Docker Desktop** instalado y corriendo. Es el único requisito obligatorio.
- **Git**, para clonar el proyecto.
- Node.js y pnpm en tu computador son **opcionales**: solo hacen falta si
  quieres usar los atajos `pnpm db:backup` / `pnpm db:restore` (que también
  funcionan con `node scripts/backup-db.mjs`).

---

## 2. Clonar y abrir en VSCode

```bash
git clone <tu-repo>
cd torneo-socorro-vscode
code .
```

Al abrir el proyecto, VSCode sugerirá instalar las extensiones recomendadas
(ESLint, Prettier, Tailwind CSS IntelliSense, Docker). Acéptalas.

---

## 3. Configurar variables de entorno

```bash
cp .env.example .env
```

Los valores por defecto ya funcionan con el `docker-compose.yml` incluido.
Lo único que **sí deberías cambiar** antes de usarlo con el torneo real es
`AUTH_SECRET`: ponle un texto largo y aleatorio.

---

## 4. Levantar la aplicación

```bash
docker compose up -d
```

Eso levanta los tres servicios:

| Servicio | Qué es | Dirección |
|---|---|---|
| `web` | Frontend (Vite) | http://localhost:5173 |
| `api` | Backend (Express) | http://localhost:4000 |
| `db` | PostgreSQL 16 | localhost:5432 |

**La primera vez tarda varios minutos**, porque construye las imágenes e
instala las dependencias dentro de los contenedores. Puedes seguir el avance:

```bash
docker compose logs -f
```

Cuando el log de `web` diga `Local: http://localhost:5173/`, abre
**http://localhost:5173** en el navegador.

Otros comandos:

```bash
docker compose ps          # ver qué está corriendo
docker compose stop        # apagar (los datos se conservan)
docker compose up -d       # volver a encender
docker compose restart api web   # reiniciar solo la app
docker compose down -v     # BORRAR TODO, incluida la base de datos
```

Los contenedores tienen `restart: unless-stopped`, así que vuelven a arrancar
solos cuando enciendes el computador o reinicias Docker Desktop.

---

## 5. Preparar la base de datos (solo la primera vez)

Los comandos de base de datos se corren **dentro del contenedor `api`**:

```bash
# 1. Crear las tablas a partir del esquema
docker compose exec api pnpm --filter @workspace/db run push

# 2. Cargar los datos reales del torneo (34 equipos, 1.260 jugadores)
docker compose exec api pnpm --filter @workspace/db run reset
```

`reset` pide confirmación escribiendo **BORRAR**, porque elimina todos los
datos (partidos, pagos, jugadores, equipos y usuarios) antes de cargar los
reales. Al terminar muestra los usuarios con los que puedes entrar.

```bash
# 3. Completar las fichas con el resto de los datos del Excel de carnés
docker compose exec api pnpm --filter @workspace/db run import-carnetizacion
```

Este último llena la fecha de la foto, la carnetización (fecha de pago, valor,
entrega y quién lo recibió) y el equipo de la temporada anterior de cada
jugador. Se puede correr las veces que haga falta: no borra nada y no toca a
los jugadores que ya se hayan editado desde la aplicación.

Si solo quieres reemplazar los jugadores sin tocar partidos ni pagos:

```bash
docker compose exec api pnpm --filter @workspace/db run import-jugadores
```

Cada vez que cambie el esquema en `lib/db/src/schema`, vuelve a correr `push`.

### De dónde sale cada dato de la ficha

Los tres archivos JSON de `lib/db/src/data/` están depurados del Excel
`Base de Datos Carné 2026`, que tiene una hoja por temporada:

| Dato de la ficha | Hoja del Excel |
|---|---|
| Cédula, nombre, fecha de nacimiento, N.º de carné, equipo | `BD_Carnet 2025 - 2026` |
| Fecha de la foto | `BD_Carnet 2025 - 2026` (columna "Foto 40") |
| Último equipo anterior y trayectoria | `BD_Carnet 2024 - 2025` (columna "Equipo 40") |
| Pago del carné, valor, entrega y quién lo recibió | `BD_Carnet 2021` |

Las columnas de la categoría 50 se ignoran a propósito: esa categoría no aplica
al torneo.

### Cargar las fotos en lote

La **foto del jugador** no está en el Excel, pero se puede cargar en bloque si
tienes un archivo por jugador nombrado con su número de carné (`123.jpg`,
`124.jpg`...), sin importar de dónde vengan (una carpeta de Google Drive, un
disco, etc.). Los contenedores de Docker no pueden ver unidades de red ni de
Google Drive del host, así que el proceso tiene dos pasos:

```bash
# 1. Copia (en el host, con Node.js normal, no dentro de Docker) los archivos
#    ya renombrados por carné a esta carpeta del proyecto:
#    lib/db/src/data/fotos-staging/<n-carnet>.jpg

# 2. Dentro del contenedor: redimensiona, comprime a JPEG y las guarda
docker compose exec api pnpm --filter @workspace/db run import-fotos
```

`import-fotos` redimensiona cada foto a un tamaño de carné (máx. 480px de
lado) antes de guardarla, para que la base de datos no crezca a varios GB ni
la ficha del jugador tarde en cargar. No pisa la foto de un jugador que ya
tenga una (por ejemplo, si alguien la subió a mano desde la aplicación), y se
puede correr las veces que haga falta. Borra la carpeta `fotos-staging/`
cuando termines: son archivos temporales, pesan varios GB y están excluidos
del repositorio a propósito.

---

## 6. Copias de seguridad

**Haz un respaldo antes de cualquier cambio grande y al final de cada fecha
del torneo.** Es lo único que protege la información si algo sale mal.

```bash
pnpm db:backup
```

Guarda un archivo `.sql` con toda la base en la carpeta `backups/`, con la
fecha y hora en el nombre. Esa carpeta está excluida de Git a propósito:
contiene datos personales de los jugadores.

> Guarda además una copia **fuera de este computador** (nube, USB, correo).
> Un respaldo que vive en el mismo disco que la base no sirve si el disco falla.

Para volver a un respaldo:

```bash
pnpm db:restore                                        # lista los disponibles
pnpm db:restore backups/torneo-socorro-2026-09-07_1155.sql
```

Pide confirmación escribiendo **RESTAURAR** y reemplaza todos los datos
actuales. La restauración es atómica: si algo falla a mitad de camino, la base
queda exactamente como estaba antes.

Si no tienes pnpm instalado, usa `node scripts/backup-db.mjs` y
`node scripts/restore-db.mjs <archivo>`.

---

## 7. Generar el calendario del torneo

En **Programación → Generar calendario** se arma el fixture completo (todos
contra todos) y tú decides qué partidos se programan de verdad. El proceso
tiene tres pasos en la misma pantalla:

1. **Equipos que participan.** Arranca con los equipos activos. Puedes quitar
   o agregar los que quieras: el calendario se rehace solo.
2. **Opciones.** Ida y vuelta o solo primera vuelta; desde qué número de semana
   empieza; la fecha de la primera jornada y cada cuántos días se juega (7 =
   una fecha por semana); y una hora por defecto.
3. **Elegir los partidos.** Se listan todas las jornadas en orden. Abre la que
   quieras y marca los partidos. Puedes marcar una jornada entera o una vuelta
   completa de un solo clic. **Nada se guarda hasta que confirmes abajo.**

Cómo se arman los cruces: con el método del círculo, que garantiza que en cada
jornada ningún equipo juegue dos veces y que al terminar la vuelta cada equipo
se haya enfrentado exactamente una vez con todos los demás. Si el número de
equipos es impar, en cada jornada descansa uno (y a lo largo de la vuelta
descansan todos, una vez cada uno). La localía queda repartida: nadie juega
siempre de local. La segunda vuelta repite los mismos cruces invirtiendo local
y visitante.

Con 29 equipos activos son 29 jornadas por vuelta, 58 en total y 812 partidos.
Por eso la pantalla arranca **sin nada marcado**: lo normal es programar una o
dos jornadas a la vez, no las 58 de una vez.

Los partidos que ya existen aparecen marcados como "ya programado" y no se
pueden volver a elegir, así que no se duplican aunque vuelvas a entrar. Si
dejas activada la casilla *"Crear también las semanas en el cronograma"*, las
fechas aparecen además en la tabla de Programación.

Para comprobar que el generador sigue armando los cruces correctamente:

```bash
docker compose exec api sh -c "cd /app && ./lib/db/node_modules/.bin/tsx artifacts/torneo-socorro/src/lib/fixture.test.ts"
```

---

## 8. Usuarios, roles y permisos

`db:reset` crea estos usuarios:

| Usuario | Contraseña | Rol |
|---|---|---|
| `sabik.barreto` | `2026` | Comité Organizador (admin) |
| `olga.barreto` | `2023` | Tesorero |

> **Cambia estas contraseñas antes de usar el sistema con el torneo real.**
> Se cambian desde la página **Usuarios**, entrando como Comité Organizador.
> Desde ahí también se crean las cuentas de Mesa, Carnetización y delegados.

Además existe el acceso **Público** (sin cuenta): cualquiera puede entrar como
invitado a consultar, sin poder modificar nada.

Qué puede hacer cada rol:

| Rol | Puede consultar | Puede modificar |
|---|---|---|
| Comité Organizador | Todo | Todo |
| Tesorero | Posiciones, programación, equipos, jugadores, pagos, egresos | Pagos y multas |
| Mesa / Árbitros | Partidos, programación, equipos, jugadores, estadísticas | Partidos, goles, tarjetas, programación |
| Carnetización | Equipos, jugadores, posiciones, programación | Jugadores (fichas y carnés) |
| Delegado de equipo | Su equipo, programación, estadísticas, estado de cuenta | Nada |
| Público | Posiciones, programación, partidos, jugadores, estadísticas | Nada |

Los permisos se definen en
[artifacts/torneo-socorro/src/lib/auth.tsx](artifacts/torneo-socorro/src/lib/auth.tsx)
(frontend) y se hacen cumplir en el backend.

---

## 9. Cambiar la API (contrato OpenAPI)

El cliente del frontend y las validaciones del backend se **generan** a partir
de [lib/api-spec/openapi.yaml](lib/api-spec/openapi.yaml). Si cambias ese
archivo, hay que regenerar:

```bash
docker compose run --rm --no-deps web sh -c "pnpm install --filter './lib/**...' && pnpm --filter @workspace/api-spec run codegen"
```

El filtro `'./lib/**...'` instala los paquetes de `lib/` con sus dependencias.
Hacen falta todos: después de generar, el propio `codegen` reconstruye los
tipos (`tsc --build`) y sin ellos no puede resolver `zod` ni `drizzle`, con lo
que el backend seguiría viendo el contrato viejo.

Después de regenerar, comprueba que ambos lados siguen compilando (paso 10) y
**reinicia el backend** para que tome los cambios:

```bash
docker compose restart api
```

> No edites a mano los archivos dentro de `lib/api-client-react/src/generated`
> ni `lib/api-zod/src/generated`: se borran y se vuelven a crear en cada
> generación. Los hooks escritos a mano viven en
> `lib/api-client-react/src/custom` y están protegidos por los filtros de
> `orval.config.ts`.

---

## 10. Verificar que todo compila

```bash
docker compose exec api pnpm --filter @workspace/api-server run build
docker compose exec web pnpm --filter @workspace/torneo-socorro run build
```

Si ambos terminan sin errores, el proyecto está sano.

---

## 11. Resumen de comandos

| Para... | Comando |
|---|---|
| Encender la aplicación | `docker compose up -d` |
| Apagarla | `docker compose stop` |
| Ver qué está corriendo | `docker compose ps` |
| Ver los logs | `docker compose logs -f` |
| Respaldar la base | `pnpm db:backup` |
| Restaurar la base | `pnpm db:restore <archivo>` |
| Crear/actualizar tablas | `docker compose exec api pnpm --filter @workspace/db run push` |
| Cargar datos reales (borra todo) | `docker compose exec api pnpm --filter @workspace/db run reset` |
| Completar fichas desde el Excel | `docker compose exec api pnpm --filter @workspace/db run import-carnetizacion` |
| Cargar fotos desde `fotos-staging/` | `docker compose exec api pnpm --filter @workspace/db run import-fotos` |
| Reiniciar tras cambiar el backend | `docker compose restart api` |
| Regenerar la API | ver paso 9 |

---

## Solución de problemas

- **`EADDRINUSE: address already in use :::4000`** → la aplicación ya está
  corriendo en Docker. Revisa con `docker compose ps` y abre
  http://localhost:5173. **No uses `pnpm dev`**: choca con los contenedores por
  los puertos 4000 y 5173.
- **La página abre pero no carga datos** → el backend no está listo. Revisa
  `docker compose logs -f api`.
- **Cambio un archivo del frontend y no se refleja en el navegador** → los
  contenedores usan `VITE_USE_POLLING=true` para detectar cambios desde
  Windows/Mac. Si aun así no aparece, `docker compose restart web`.
- **Cambio código del backend y no pasa nada** → el backend **no recarga solo**
  (su `dev` es `build && start`, sin modo watch). Después de tocar algo en
  `artifacts/api-server` o `lib/db`, corre `docker compose restart api`.
- **"DATABASE_URL must be set"** → falta el archivo `.env` (paso 3).
- **Cambié el esquema y la app da error de columna inexistente** → falta correr
  `docker compose exec api pnpm --filter @workspace/db run push`.
- **Los contenedores se apagaron solos** → suele ser un reinicio de Docker
  Desktop. `docker compose up -d` los vuelve a levantar.
- **Empezar de cero** → `docker compose down -v` borra también la base de
  datos. Haz `pnpm db:backup` antes si quieres conservar algo.
