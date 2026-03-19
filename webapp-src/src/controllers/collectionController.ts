import type { CollectionRouteDeps, RouteRegistrar } from "../types/routeDeps.js";
import { registerCollectionServiceRoutes } from "../services/collectionRouteService.js";

function registerCollectionControllerRoutes(app: RouteRegistrar, deps: CollectionRouteDeps) {
  registerCollectionServiceRoutes(app, deps);
}

export {
  registerCollectionControllerRoutes,
};
