import type { LoanRouteDeps, RouteRegistrar } from "../types/routeDeps.js";
import { registerLoanServiceRoutes } from "../services/loanRouteService.js";

function registerLoanControllerRoutes(app: RouteRegistrar, deps: LoanRouteDeps) {
  registerLoanServiceRoutes(app, deps);
}

export {
  registerLoanControllerRoutes,
};
