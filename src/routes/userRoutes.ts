import type { RouteRegistrar, UserRouteDeps } from "../types/routeDeps.js";
import { registerUserControllerRoutes } from "../controllers/userController.js";

function registerUserRoutes(app: RouteRegistrar, deps: UserRouteDeps) {
  registerUserControllerRoutes(app, deps);
}

export {
  registerUserRoutes,
};
