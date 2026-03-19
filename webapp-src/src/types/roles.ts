export type RoleId =
  | "admin"
  | "ceo"
  | "finance"
  | "investor"
  | "partner"
  | "operations_manager"
  | "it"
  | "area_manager"
  | "loan_officer"
  | "cashier";

export interface RoleDefinition {
  label: string;
  description: string;
  scopeRule?: string;
  capabilities: string[];
}

export type RoleCatalog = Record<RoleId, RoleDefinition>;
export type RoleAliasMap = Record<string, RoleId>;
