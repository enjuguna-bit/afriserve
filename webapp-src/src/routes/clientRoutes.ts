import type { ClientRouteDeps, RouteRegistrar } from "../types/routeDeps.js";
import { createClientController } from "../controllers/clientController.js";
import { getRbacPolicy } from "../config/rbacPolicies.js";

/**
 * @param {RouteRegistrar} app
 * @param {ClientRouteDeps} deps
 */
function registerClientRoutes(app: RouteRegistrar, deps: ClientRouteDeps) {
  const controller = createClientController(deps);

  const clientCreateRoles = ["admin", "loan_officer"];
  const clientUpdateRoles = ["admin", "loan_officer", "operations_manager", "area_manager"];
  const clientAssignmentRoles = ["admin", "operations_manager", "area_manager"];
  const clientKycManageRoles = ["admin", "loan_officer"];
  const clientViewRoles = getRbacPolicy("clients.read").roles;

  const {
    authenticate,
    authorize,
  } = deps;

  app.post("/api/clients", authenticate, authorize(...clientCreateRoles), controller.createClient);
  app.patch("/api/clients/:id/kyc", authenticate, authorize(...clientKycManageRoles), controller.updateClientKyc);
  app.post("/api/clients/:id/kyc", authenticate, authorize(...clientKycManageRoles), controller.updateClientKyc);
  app.patch("/api/clients/:id", authenticate, authorize(...clientUpdateRoles), controller.updateClient);
  app.put("/api/clients/:id", authenticate, authorize(...clientUpdateRoles), controller.updateClient);
  app.get("/api/clients", authenticate, authorize(...clientViewRoles), controller.listClients);
  app.get("/api/clients/assignable-officers", authenticate, authorize(...clientAssignmentRoles), controller.listAssignableOfficers);
  app.post("/api/clients/portfolio-reallocation", authenticate, authorize(...clientAssignmentRoles), controller.reallocatePortfolio);
  app.get("/api/clients/potential-duplicates", authenticate, authorize(...clientViewRoles), controller.listPotentialDuplicates);
  app.get("/api/clients/:id", authenticate, authorize(...clientViewRoles), controller.getClient);
  app.get("/api/clients/:id/loans", authenticate, authorize(...clientViewRoles), controller.getClientLoans);
  app.post("/api/clients/:id/guarantors", authenticate, authorize(...clientCreateRoles), controller.addClientGuarantor);
  app.patch("/api/clients/:clientId/guarantors/:guarantorId", authenticate, authorize("admin"), controller.updateClientGuarantor);
  app.get("/api/clients/:id/guarantors", authenticate, authorize(...clientViewRoles), controller.getClientGuarantors);
  app.post("/api/clients/:id/collaterals", authenticate, authorize(...clientCreateRoles), controller.addClientCollateral);
  app.patch("/api/clients/:clientId/collaterals/:collateralId", authenticate, authorize("admin"), controller.updateClientCollateral);
  app.get("/api/clients/:id/collaterals", authenticate, authorize(...clientViewRoles), controller.getClientCollaterals);
  app.post("/api/clients/:id/fees", authenticate, authorize(...clientCreateRoles), controller.recordClientFeePayment);
  app.get("/api/clients/:id/onboarding-status", authenticate, authorize(...clientViewRoles), controller.getClientOnboardingStatus);
  app.get("/api/clients/:id/history", authenticate, authorize(...clientViewRoles), controller.getClientHistory);
}

export {
  registerClientRoutes,
};
