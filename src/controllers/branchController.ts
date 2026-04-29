import type { BranchRouteDeps, RouteRegistrar } from "../types/routeDeps.js";
import { registerBranchServiceRoutes } from "../routes/services/branchRouteService.js";

function registerBranchControllerRoutes(app: RouteRegistrar, deps: BranchRouteDeps) {
  registerBranchServiceRoutes(app, deps);
}

export {
  registerBranchControllerRoutes,
};

