ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS photo_metadata_json TEXT;

ALTER TABLE collateral_assets
  ADD COLUMN IF NOT EXISTS image_urls_json TEXT;

CREATE TABLE IF NOT EXISTS client_profile_versions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  version_number BIGINT NOT NULL,
  based_on_refresh_id BIGINT,
  snapshot_json TEXT NOT NULL,
  note TEXT,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  effective_from TIMESTAMPTZ(3) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT uniq_client_profile_versions_client_version UNIQUE (client_id, version_number)
);

CREATE TABLE IF NOT EXISTS client_profile_refreshes (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  based_on_version_id BIGINT,
  based_on_version_number BIGINT,
  approved_version_id BIGINT,
  status TEXT NOT NULL DEFAULT 'draft',
  priority_status TEXT NOT NULL DEFAULT 'normal',
  requested_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  submitted_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  requested_note TEXT,
  submission_note TEXT,
  review_note TEXT,
  locked_fields_json TEXT,
  editable_fields_json TEXT,
  active_snapshot_json TEXT NOT NULL,
  draft_snapshot_json TEXT NOT NULL,
  requested_at TIMESTAMPTZ(3) NOT NULL,
  submitted_at TIMESTAMPTZ(3),
  reviewed_at TIMESTAMPTZ(3),
  approved_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL,
  updated_at TIMESTAMPTZ(3) NOT NULL,
  pushback_count BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS client_profile_refresh_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  refresh_id BIGINT NOT NULL REFERENCES client_profile_refreshes(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  field_path TEXT,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  previous_value_json TEXT,
  next_value_json TEXT,
  reason TEXT,
  gps_latitude DOUBLE PRECISION,
  gps_longitude DOUBLE PRECISION,
  gps_accuracy_meters DOUBLE PRECISION,
  device_captured_at TIMESTAMPTZ(3),
  metadata_json TEXT,
  created_at TIMESTAMPTZ(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS client_profile_refresh_feedback (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  refresh_id BIGINT NOT NULL REFERENCES client_profile_refreshes(id) ON DELETE CASCADE,
  field_path TEXT NOT NULL,
  reason_code TEXT,
  comment TEXT,
  flagged_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  resolved_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  flagged_at TIMESTAMPTZ(3) NOT NULL,
  resolved_at TIMESTAMPTZ(3),
  status TEXT NOT NULL DEFAULT 'open'
);

CREATE INDEX IF NOT EXISTS idx_client_profile_versions_client_effective
  ON client_profile_versions (client_id, effective_from);

CREATE INDEX IF NOT EXISTS idx_client_profile_versions_tenant_client
  ON client_profile_versions (tenant_id, client_id);

CREATE INDEX IF NOT EXISTS idx_client_profile_refreshes_tenant_status
  ON client_profile_refreshes (tenant_id, status, priority_status);

CREATE INDEX IF NOT EXISTS idx_client_profile_refreshes_assigned_status
  ON client_profile_refreshes (assigned_to_user_id, status);

CREATE INDEX IF NOT EXISTS idx_client_profile_refresh_events_refresh_created
  ON client_profile_refresh_events (refresh_id, created_at);

CREATE INDEX IF NOT EXISTS idx_client_profile_refresh_feedback_refresh_status
  ON client_profile_refresh_feedback (refresh_id, status, field_path);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_profile_refreshes_open_refresh
  ON client_profile_refreshes (client_id)
  WHERE status IN ('draft', 'pending_review', 'pushed_back');
