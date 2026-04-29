CREATE INDEX IF NOT EXISTS "idx_mobile_money_c2b_status"
ON "mobile_money_c2b_events"("status");

CREATE INDEX IF NOT EXISTS "idx_collection_actions_status_follow_up_date"
ON "collection_actions"("action_status", "next_follow_up_date");

CREATE INDEX IF NOT EXISTS "idx_transactions_tx_type_occurred_at"
ON "transactions"("tx_type", "occurred_at");

CREATE INDEX IF NOT EXISTS "idx_gl_entries_account_created_at"
ON "gl_entries"("account_id", "created_at");
