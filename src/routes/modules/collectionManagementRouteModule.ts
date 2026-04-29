import type { CollectionManagementRouteOptions } from "./collectionManagementRouteTypes.js";
import { registerCollectionOverdueRoutes } from "./collectionOverdueRouteModule.js";
import { registerCollectionActionMutationRoutes } from "./collectionActionMutationRouteModule.js";
import { registerCollectionSummaryRoutes } from "./collectionSummaryRouteModule.js";

function registerCollectionManagementRoutes(options: CollectionManagementRouteOptions) {
  registerCollectionOverdueRoutes(options);
  registerCollectionActionMutationRoutes(options);
  registerCollectionSummaryRoutes(options);
}

export {
  registerCollectionManagementRoutes,
};
