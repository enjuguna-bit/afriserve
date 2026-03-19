import type { BranchManagementRouteOptions } from "./branchManagementRouteTypes.js";
import { registerBranchReadRoutes } from "./branchReadRouteModule.js";
import { registerBranchReportRoutes } from "./branchReportRouteModule.js";
import { registerBranchMutationRoutes } from "./branchMutationRouteModule.js";

function registerBranchManagementRoutes(options: BranchManagementRouteOptions) {
  registerBranchReadRoutes(options);
  registerBranchReportRoutes(options);
  registerBranchMutationRoutes(options);
}

export {
  registerBranchManagementRoutes,
};
