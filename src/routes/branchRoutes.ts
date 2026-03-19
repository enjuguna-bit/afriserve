import type { BranchRouteDeps, RouteRegistrar } from "../types/routeDeps.js";
import { registerBranchControllerRoutes } from "../controllers/branchController.js";

function registerBranchRoutes(app: RouteRegistrar, deps: BranchRouteDeps) {
  registerBranchControllerRoutes(app, deps);
}

export {
  registerBranchRoutes,
};
