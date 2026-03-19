import { registerUserReadRoutes } from "./userReadRouteModule.js";
import { registerUserAccountActionRoutes } from "./userAccountActionRouteModule.js";
import type { UserManagementRouteOptions } from "./userManagementRouteTypes.js";

function registerUserManagementRoutes(options: UserManagementRouteOptions) {
  registerUserReadRoutes(options);
  registerUserAccountActionRoutes(options);
}

export {
  registerUserManagementRoutes,
};
