import type { RouteRegistrar, UserRouteDeps } from "../types/routeDeps.js";
import { registerUserServiceRoutes } from "../routes/services/userRouteService.js";

function registerUserControllerRoutes(app: RouteRegistrar, deps: UserRouteDeps) {
  registerUserServiceRoutes(app, deps);
}

export {
  registerUserControllerRoutes,
};

