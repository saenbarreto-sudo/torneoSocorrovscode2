import { defineConfig, InputTransformerFn } from "orval";
import path from "path";

const root = path.resolve(__dirname, "..", "..");
const apiClientReactSrc = path.resolve(root, "lib", "api-client-react", "src");
const apiZodSrc = path.resolve(root, "lib", "api-zod", "src");

// Our exports make assumptions about the title of the API being "Api" (i.e. generated output is `api.ts`).
const titleTransformer: InputTransformerFn = (config) => {
  config.info ??= {};
  config.info.title = "Api";

  return config;
};

// Endpoints cuyos hooks de React se mantienen a mano en
// "lib/api-client-react/src/custom/". No es que falten en el contrato: están
// documentados en openapi.yaml (y el cliente zod SÍ los genera, porque el
// backend los usa para validar). Se excluyen solo del cliente de React
// porque las versiones a mano agregan comportamiento que orval no genera:
// invalidación de caché de react-query (p. ej. al guardar una planilla hay
// que refrescar posiciones, goleadores, tarjetas y vallas).
// Si algún día se quiere usar el hook generado, hay que borrar el archivo
// correspondiente en "custom/" y sacar su tag de esta lista.
const TAGS_CON_HOOKS_A_MANO = [
  "auth",
  "goles",
  "planilla",
  "vallas",
  "sanciones",
  "egresos",
  "usuarios",
];

export default defineConfig({
  "api-client-react": {
    input: {
      target: "./openapi.yaml",
      filters: {
        mode: "exclude",
        tags: TAGS_CON_HOOKS_A_MANO,
      },
      override: {
        transformer: titleTransformer,
      },
    },
    output: {
      workspace: apiClientReactSrc,
      target: "generated",
      client: "react-query",
      mode: "split",
      baseUrl: "/api",
      clean: true,
      prettier: true,
      override: {
        fetch: {
          includeHttpResponseReturnType: false,
        },
        mutator: {
          path: path.resolve(apiClientReactSrc, "custom-fetch.ts"),
          name: "customFetch",
        },
      },
    },
  },
  zod: {
    input: {
      target: "./openapi.yaml",
      override: {
        transformer: titleTransformer,
      },
    },
    output: {
      workspace: apiZodSrc,
      client: "zod",
      target: "generated",
      schemas: { path: "generated/types", type: "typescript" },
      mode: "split",
      clean: true,
      prettier: true,
      override: {
        zod: {
          coerce: {
            query: ['boolean', 'number', 'string'],
            param: ['boolean', 'number', 'string'],
            body: ['bigint', 'date'],
            response: ['bigint', 'date'],
          },
        },
        useDates: true,
        useBigInt: true,
      },
    },
  },
});
