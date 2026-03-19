import type { RequestHandler } from "express";

type SchemaLike<T = unknown> = {
  parse: (value: unknown) => T;
};

type ValidationTarget = "body" | "query" | "params";

function validate<T = unknown>(
  schema: SchemaLike<T>,
  target: ValidationTarget = "body",
): RequestHandler {
  return (req, _res, next) => {
    try {
      const parsed = schema.parse(req[target] ?? {});
      (req as any)[target] = parsed;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export {
  validate,
};
