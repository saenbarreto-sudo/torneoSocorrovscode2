# Torneo Socorro Senior Master Plus 40

Aplicación para administrar el torneo: equipos, jugadores, partidos, posiciones,
goleadores, amonestados y pagos. Incluye inicio de sesión por roles.

Este proyecto es un **monorepo pnpm** con tres partes principales:

- `artifacts/torneo-socorro` → frontend (React + Vite + Tailwind)
- `artifacts/api-server` → backend (Express)
- `lib/db` → esquema y conexión a la base de datos (PostgreSQL + Drizzle ORM)

---

## 1. Requisitos

- **Node.js 20.11 o superior** (recomendado 22 o 24). Verifica con `node -v`.
- **pnpm** (el proyecto está bloqueado a pnpm, no funciona con npm/yarn):
  ```bash
  corepack enable
  corepack prepare pnpm@latest --activate
  # o, si no usas corepack:
  npm install -g pnpm
  ```
- **PostgreSQL**. La forma más fácil es con Docker:
  - **Docker Desktop** (o Docker Engine) instalado y corriendo.
  - Alternativa: usa tu propia instancia local de Postgres y ajusta `DATABASE_URL`.

---

## 2. Clonar y abrir en VSCode

```bash
git clone <tu-repo>
cd Excel-Data-Manager
code .
```

Al abrir el proyecto, VSCode sugerirá instalar las extensiones recomendadas
(ESLint, Prettier, Tailwind CSS IntelliSense, Docker). Acéptalas para tener
autocompletado y formateo correctos.

---

## 3. Configurar variables de entorno

```bash
cp .env.example .env
```

El archivo `.env.example` trae valores por defecto que funcionan directo con
el `docker-compose.yml` incluido, así que normalmente no necesitas editar nada.

---

## 4. Levantar la base de datos

```bash
docker compose up -d
```

Esto crea un Postgres local en `localhost:5432` con la base `torneo_socorro`.

Para detenerla: `docker compose down` (los datos persisten).
Para borrar todo: `docker compose down -v`.

---

## 5. Instalar dependencias

Desde la raíz del proyecto:

```bash
pnpm install
```

> Si ves el error `Use pnpm instead`, es porque intentaste instalar con `npm`
> o `yarn`. Este monorepo solo soporta pnpm.

---

## 6. Crear las tablas en la base de datos

```bash
pnpm db:push
```

Esto sincroniza el esquema de `lib/db/src/schema` con Postgres. Solo hace
falta correrlo la primera vez y cada vez que cambie el esquema.

---

## 6.1 Cargar los datos reales del torneo

Para dejar la base con los equipos y jugadores reales (34 equipos, 1.260
jugadores de la Base de Datos de Carné) y los usuarios base:

```bash
pnpm db:reset
```

Pide confirmación escribiendo "BORRAR", porque **elimina todos los datos**
(partidos, pagos, jugadores, equipos y usuarios) antes de cargar los reales.

Si solo quieres reemplazar los jugadores sin tocar partidos ni pagos:

```bash
pnpm db:import-jugadores
```

---

## 7. Correr el proyecto

**Opción A — todo junto (recomendado):**

```bash
pnpm dev
```

Levanta el backend (`http://localhost:4000`) y el frontend
(`http://localhost:5173`) al mismo tiempo. `Ctrl+C` detiene ambos.

**Opción B — cada uno en su propia terminal de VSCode:**

```bash
pnpm dev:api   # terminal 1 — backend
pnpm dev:web   # terminal 2 — frontend
```

Abre **http://localhost:5173** en el navegador. Vas a ver la pantalla de
inicio de sesión por roles.

---

## 8. Roles y PIN de acceso

| Rol | PIN | Acceso |
|---|---|---|
| Comité Organizador | `2026` | Total |
| Tesorero | `1357` | Pagos, multas, estados de cuenta |
| Mesa / Árbitros | `4589` | Partidos, programación, tarjetas |
| Delegado de equipo | `7777` | Consulta de su equipo |
| Público | *(sin PIN)* | Solo consulta |

Los PIN se definen en `artifacts/torneo-socorro/src/lib/auth.tsx`. Cámbialos
antes de usar el sistema con el torneo real.

---

## 9. Verificar que compila sin errores

```bash
pnpm build
```

Corre el chequeo de tipos de todo el monorepo y compila cada paquete
(`typecheck` + `build` en frontend y backend). Si esto termina sin errores,
el proyecto está listo para desplegarse.

---

## Solución de problemas

- **"DATABASE_URL must be set"** → falta el archivo `.env` (paso 3) o Docker
  no está corriendo (paso 4).
- **El frontend carga pero las páginas están vacías / dan error de red** →
  el backend no está corriendo. Usa `pnpm dev` (opción A) o revisa la
  terminal del backend (`pnpm dev:api`).
- **Puerto ocupado (`EADDRINUSE`)** → cambia `PORT`, `FRONTEND_PORT` o
  `API_PORT` en tu `.env`.
- **Error al instalar con npm/yarn** → usa `pnpm`, es obligatorio en este
  monorepo (ver paso 5).
- **Windows** → los scripts (`pnpm dev`, `preinstall`, etc.) usan sintaxis de
  shell Unix. En Windows usa **WSL2** o la terminal de **Git Bash** dentro de
  VSCode (Terminal → New Terminal → selecciona "Git Bash" en el desplegable),
  en vez de PowerShell o CMD.
