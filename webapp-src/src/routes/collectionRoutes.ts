import type { CollectionRouteDeps, RouteRegistrar } from "../types/routeDeps.js";
import { registerCollectionControllerRoutes } from "../controllers/collectionController.js";

function registerCollectionRoutes(app: RouteRegistrar, deps: CollectionRouteDeps) {
  registerCollectionControllerRoutes(app, deps);
}

export {
  registerCollectionRoutes,
};
