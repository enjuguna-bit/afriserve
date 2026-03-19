import type { BranchRouteDeps, RouteRegistrar } from "../types/routeDeps.js";
import { registerBranchServiceRoutes } from "../services/branchRouteService.js";

function registerBranchControllerRoutes(app: RouteRegistrar, deps: BranchRouteDeps) {
  registerBranchServiceRoutes(app, deps);
}

export {
  registerBranchControllerRoutes,
};
