# Imagen de desarrollo para el backend (Express).
#
# El código del monorepo se monta como volumen desde docker-compose.yml (ver
# la raíz del repo) y "pnpm install" corre dentro del contenedor al arrancar,
# así las dependencias de npm nunca se descargan ni ejecutan en el host.
FROM node:20-bookworm-slim

RUN corepack enable

WORKDIR /app

EXPOSE 4000

CMD ["sh", "-c", "pnpm install --filter '@workspace/api-server...' && pnpm --filter @workspace/api-server run dev"]
