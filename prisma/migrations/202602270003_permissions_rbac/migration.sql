CREATE TABLE IF NOT EXISTS "permissions" (
  "permission_id" TEXT NOT NULL PRIMARY KEY,
  "description" TEXT NOT NULL,
  "created_at" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "role_permissions" (
  "role" TEXT NOT NULL,
  "permission_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  PRIMARY KEY ("role", "permission_id"),
  CONSTRAINT "role_permissions_permission_id_fkey"
    FOREIGN KEY ("permission_id") REFERENCES "permissions" ("permission_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "role_permissions_permission_id_idx"
  ON "role_permissions" ("permission_id");

CREATE TABLE IF NOT EXISTS "user_custom_permissions" (
  "user_id" INTEGER NOT NULL,
  "permission_id" TEXT NOT NULL,
  "granted_at" TEXT NOT NULL,
  "granted_by_user_id" INTEGER,
  PRIMARY KEY ("user_id", "permission_id"),
  CONSTRAINT "user_custom_permissions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_custom_permissions_permission_id_fkey"
    FOREIGN KEY ("permission_id") REFERENCES "permissions" ("permission_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_custom_permissions_granted_by_user_id_fkey"
    FOREIGN KEY ("granted_by_user_id") REFERENCES "users" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "user_custom_permissions_permission_id_idx"
  ON "user_custom_permissions" ("permission_id");

CREATE INDEX IF NOT EXISTS "user_custom_permissions_granted_by_user_id_idx"
  ON "user_custom_permissions" ("granted_by_user_id");

INSERT INTO "permissions" ("permission_id", "description", "created_at") VALUES
  ('user.manage', 'Create/update/deactivate users and assign roles', datetime('now')),
  ('loan.approve', 'Approve high-risk and pending loans', datetime('now')),
  ('loan.disburse', 'Disburse approved loans', datetime('now')),
  ('loan.reject', 'Reject pending loan applications', datetime('now')),
  ('audit.view', 'View audit logs and compliance trails', datetime('now')),
  ('system.config', 'Access system configuration and operational controls', datetime('now'))
ON CONFLICT(permission_id) DO NOTHING;

INSERT INTO "role_permissions" ("role", "permission_id", "created_at") VALUES
  ('admin', 'user.manage', datetime('now')),
  ('admin', 'loan.approve', datetime('now')),
  ('admin', 'loan.disburse', datetime('now')),
  ('admin', 'loan.reject', datetime('now')),
  ('admin', 'audit.view', datetime('now')),
  ('admin', 'system.config', datetime('now')),
  ('ceo', 'audit.view', datetime('now')),
  ('operations_manager', 'loan.approve', datetime('now')),
  ('operations_manager', 'loan.disburse', datetime('now')),
  ('operations_manager', 'loan.reject', datetime('now')),
  ('operations_manager', 'audit.view', datetime('now')),
  ('finance', 'loan.disburse', datetime('now')),
  ('cashier', 'loan.disburse', datetime('now')),
  ('area_manager', 'loan.approve', datetime('now'))
ON CONFLICT(role, permission_id) DO NOTHING;
