import type { NextFunction, Request, Response } from "express";

type ScopeGuardResource = {
  branchId: number | null | undefined;
  [key: string]: unknown;
};

type ScopeGuardOptions = {
  resourceName: string;
  hierarchyService: {
    resolveHierarchyScope: (user: any) => Promise<any>;
    isBranchInScope: (scope: any, branchId: number | null | undefined) => boolean;
  };
  resolveResource: (req: Request) => Promise<ScopeGuardResource | null>;
};

function createHttpError(status: number, message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function requireResourceInScope(options: ScopeGuardOptions) {
  const { resourceName, hierarchyService, resolveResource } = options;
  const forbiddenMessage = `Forbidden: ${resourceName} is outside your scope`;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resource = await resolveResource(req);
      if (!resource) {
        res.status(404).json({ message: `${resourceName} not found` });
        return;
      }

      const scope = await hierarchyService.resolveHierarchyScope((req as any).user);
      if (!hierarchyService.isBranchInScope(scope, resource.branchId)) {
        res.status(403).json({ message: forbiddenMessage });
        return;
      }

      (req as any).scopeResource = resource;
      next();
    } catch (error) {
      const typedError = error as Error & { status?: number };
      if (typedError && Number.isInteger(Number(typedError.status))) {
        res.status(Number(typedError.status)).json({ message: typedError.message || "Request failed" });
        return;
      }
      next(error);
    }
  };
}

export {
  createHttpError,
  requireResourceInScope,
};
