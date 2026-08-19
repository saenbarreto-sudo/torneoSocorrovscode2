# Imagen de desarrollo para el frontend (Vite).
#
# El código del monorepo se monta como volumen desde docker-compose.yml (ver
# la raíz del repo) y "pnpm install" corre dentro del contenedor al arrancar,
# así las dependencias de npm nunca se descargan ni ejecutan en el host.
#
# Debian (no Alpine): pnpm-workspace.yaml excluye a propósito los binarios
# nativos "musl" de lightningcss y @tailwindcss/oxide, así que esta imagen
# necesita glibc para que Tailwind v4 / Vite funcionen.
FROM node:20-bookworm-slim

RUN corepack enable

WORKDIR /app

EXPOSE 5173

CMD ["sh", "-c", "pnpm install --filter '@workspace/torneo-socorro...' && pnpm --filter @workspace/torneo-socorro run dev"]
