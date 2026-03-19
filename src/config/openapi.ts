import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
import type { ExpressLikeApp } from "../types/runtime.js";

function registerOpenApiDocs(app: ExpressLikeApp) {
  const configuredServerUrl = String(process.env.API_BASE_URL || "").trim();
  const fallbackServerUrl = `http://localhost:${Number(process.env.PORT || 4000)}`;
  const serverUrl = configuredServerUrl || fallbackServerUrl;

  let cachedSpec: Record<string, unknown> | null = null;

  function getSpec() {
    if (cachedSpec) {
      return cachedSpec;
    }

    cachedSpec = swaggerJsdoc({
      definition: {
        openapi: "3.0.3",
        info: {
          title: "Afriserve Microfinance API",
          version: "1.0.0",
          description: "Operational API documentation for web and mobile clients.",
        },
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
            },
          },
        },
        servers: [
          {
            url: serverUrl,
          },
        ],
      },
      apis: [
        path.join(currentDir, "..", "routes", "*.js"),
        path.join(currentDir, "..", "routes", "*.ts"),
        path.join(currentDir, "..", "routes", "**", "*.js"),
        path.join(currentDir, "..", "routes", "**", "*.ts"),
      ],
    }) as Record<string, unknown>;

    return cachedSpec;
  }

  app.get("/api/openapi.json", (_req: Request, res: Response) => {
    try {
      res.status(200).json(getSpec());
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to generate OpenAPI specification",
      });
    }
  });

  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      explorer: true,
      customSiteTitle: "Afriserve API Docs",
      swaggerOptions: {
        url: "/api/openapi.json",
      },
    }),
  );
}

export {
  registerOpenApiDocs,
};
