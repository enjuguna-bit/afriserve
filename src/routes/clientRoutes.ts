import type { ClientRouteDeps, RouteRegistrar } from "../types/routeDeps.js";
import { createClientController } from "../controllers/clientController.js";
import { getRbacPolicy } from "../config/rbacPolicies.js";

/**
 * All role lists derived from RBAC_POLICIES — never hardcoded inline.
 * To change who can perform an action, update rbacPolicies.ts only.
 */
function registerClientRoutes(app: RouteRegistrar, deps: ClientRouteDeps) {
  const controller = createClientController(deps);

  const clientCreateRoles    = getRbacPolicy("clients.create").roles;
  const clientUpdateRoles    = getRbacPolicy("clients.update").roles;
  const clientAssignmentRoles = getRbacPolicy("clients.assignment.manage").roles;
  const clientKycManageRoles = getRbacPolicy("clients.kyc.manage").roles;
  const clientViewRoles      = getRbacPolicy("clients.read").roles;
  const clientProfileRefreshRequestRoles = getRbacPolicy("clients.profile_refresh.request").roles;
  const clientProfileRefreshUpdateRoles = getRbacPolicy("clients.profile_refresh.update").roles;
  const clientProfileRefreshReviewRoles = getRbacPolicy("clients.profile_refresh.review").roles;

  const { authenticate, authorize } = deps;

  app.post("/api/clients",                         authenticate, authorize(...clientCreateRoles),     controller.createClient);
  app.patch("/api/clients/:id/kyc",                authenticate, authorize(...clientKycManageRoles),  controller.updateClientKyc);
  app.post("/api/clients/:id/kyc",                 authenticate, authorize(...clientKycManageRoles),  controller.updateClientKyc);
  app.patch("/api/clients/:id",                    authenticate, authorize(...clientUpdateRoles),     controller.updateClient);
  app.put("/api/clients/:id",                      authenticate, authorize(...clientUpdateRoles),     controller.updateClient);
  app.get("/api/clients",                          authenticate, authorize(...clientViewRoles),       controller.listClients);
  app.get("/api/client-profile-refreshes",         authenticate, authorize(...clientViewRoles),       controller.listProfileRefreshes);
  app.get("/api/client-profile-refreshes/:refreshId", authenticate, authorize(...clientViewRoles),    controller.getProfileRefresh);
  app.patch("/api/client-profile-refreshes/:refreshId", authenticate, authorize(...clientProfileRefreshUpdateRoles), controller.updateProfileRefreshDraft);
  app.post("/api/client-profile-refreshes/:refreshId/submit", authenticate, authorize(...clientProfileRefreshUpdateRoles), controller.submitProfileRefresh);
  app.post("/api/client-profile-refreshes/:refreshId/review", authenticate, authorize(...clientProfileRefreshReviewRoles), controller.reviewProfileRefresh);
  app.get("/api/clients/assignable-officers",      authenticate, authorize(...clientAssignmentRoles), controller.listAssignableOfficers);
  app.post("/api/clients/portfolio-reallocation",  authenticate, authorize(...clientAssignmentRoles), controller.reallocatePortfolio);
  app.get("/api/clients/potential-duplicates",     authenticate, authorize(...clientViewRoles),       controller.listPotentialDuplicates);
  app.get("/api/clients/me",                       authenticate, authorize(...clientViewRoles),       controller.getCurrentClient);
  app.get("/api/clients/:id",                      authenticate, authorize(...clientViewRoles),       controller.getClient);
  app.post("/api/clients/:id/profile-refreshes",   authenticate, authorize(...clientProfileRefreshRequestRoles), controller.createProfileRefresh);
  app.get("/api/clients/:id/profile-versions",     authenticate, authorize(...clientViewRoles),       controller.listProfileVersions);
  app.get("/api/clients/:id/profile-versions/:versionId", authenticate, authorize(...clientViewRoles), controller.getProfileVersion);
  app.get("/api/clients/:id/loans",                authenticate, authorize(...clientViewRoles),       controller.getClientLoans);
  app.post("/api/clients/:id/guarantors",          authenticate, authorize(...clientCreateRoles),     controller.addClientGuarantor);
  app.patch("/api/clients/:clientId/guarantors/:guarantorId", authenticate, authorize("admin"),       controller.updateClientGuarantor);
  app.get("/api/clients/:id/guarantors",           authenticate, authorize(...clientViewRoles),       controller.getClientGuarantors);
  app.post("/api/clients/:id/collaterals",         authenticate, authorize(...clientCreateRoles),     controller.addClientCollateral);
  app.patch("/api/clients/:clientId/collaterals/:collateralId", authenticate, authorize("admin"),     controller.updateClientCollateral);
  app.get("/api/clients/:id/collaterals",          authenticate, authorize(...clientViewRoles),       controller.getClientCollaterals);
  app.post("/api/clients/:id/fees",                authenticate, authorize(...clientCreateRoles),     controller.recordClientFeePayment);
  app.get("/api/clients/:id/onboarding-status",    authenticate, authorize(...clientViewRoles),       controller.getClientOnboardingStatus);
  app.get("/api/clients/:id/history",              authenticate, authorize(...clientViewRoles),       controller.getClientHistory);
}

export {
  registerClientRoutes,
};
