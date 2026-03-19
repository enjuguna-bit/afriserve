import type { LoanRouteDeps, RouteRegistrar } from "../types/routeDeps.js";
import { registerLoanControllerRoutes } from "../controllers/loanController.js";

function registerLoanRoutes(app: RouteRegistrar, deps: LoanRouteDeps) {
  registerLoanControllerRoutes(app, deps);
}

export {
  registerLoanRoutes,
};
