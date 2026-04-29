/**
 * validators.ts — barrel re-export.
 *
 * All schema definitions live in ./validators/<domain>Schemas.ts.
 * This file exists so that all existing import paths
 * (../validators.js, ../../validators.js, etc.) keep working
 * without any changes to callers.
 *
 * To add a new schema: add it to the appropriate domain file and
 * re-export it here. Do not add schema logic to this file directly.
 */

export * from "./validators/shared.js";
export * from "./validators/authSchemas.js";
export * from "./validators/clientSchemas.js";
export * from "./validators/loanSchemas.js";
export * from "./validators/branchSchemas.js";
export * from "./validators/collectionSchemas.js";
