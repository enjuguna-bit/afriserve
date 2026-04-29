/*
  Warnings:

  - You are about to drop the `capital_transactions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `domain_events` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `loan_overpayment_credits` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `repayment_idempotency_keys` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tenants` table. If the table is not empty, all the data it contains will be lost.
  - You are about to alter the column `approved_at` on the `approval_requests` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `approval_requests` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `executed_at` on the `approval_requests` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `expires_at` on the `approval_requests` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `rejected_at` on the `approval_requests` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `requested_at` on the `approval_requests` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `reviewed_at` on the `approval_requests` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `updated_at` on the `approval_requests` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `area_manager_branch_assignments` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `audit_logs` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `branches` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `updated_at` on the `branches` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `clients` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `deleted_at` on the `clients` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `fees_paid_at` on the `clients` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `updated_at` on the `clients` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `collateral_assets` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `estimated_value` on the `collateral_assets` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `updated_at` on the `collateral_assets` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `valuation_date` on the `collateral_assets` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `collection_actions` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `next_follow_up_date` on the `collection_actions` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `promise_date` on the `collection_actions` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `gl_accounts` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `gl_balance_snapshots` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `credit_total` on the `gl_balance_snapshots` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `debit_total` on the `gl_balance_snapshots` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `net_balance` on the `gl_balance_snapshots` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `snapshot_date` on the `gl_balance_snapshots` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `completed_at` on the `gl_batch_runs` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `gl_batch_runs` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `effective_date` on the `gl_batch_runs` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `started_at` on the `gl_batch_runs` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `gl_coa_accounts` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `updated_at` on the `gl_coa_accounts` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `activated_at` on the `gl_coa_versions` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `gl_coa_versions` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `effective_from` on the `gl_coa_versions` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `effective_to` on the `gl_coa_versions` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `updated_at` on the `gl_coa_versions` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `amount` on the `gl_entries` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `created_at` on the `gl_entries` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `transaction_amount` on the `gl_entries` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `created_at` on the `gl_fx_rates` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `quoted_at` on the `gl_fx_rates` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `rate` on the `gl_fx_rates` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `exchange_rate` on the `gl_journals` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `fx_rate_timestamp` on the `gl_journals` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `posted_at` on the `gl_journals` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `total_credit` on the `gl_journals` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `total_debit` on the `gl_journals` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `created_at` on the `gl_period_locks` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `lock_date` on the `gl_period_locks` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `locked_at` on the `gl_period_locks` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `allocated_at` on the `gl_suspense_allocations` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `allocated_transaction_amount` on the `gl_suspense_allocations` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `carrying_book_amount` on the `gl_suspense_allocations` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `created_at` on the `gl_suspense_allocations` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `fx_difference_amount` on the `gl_suspense_allocations` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `fx_rate` on the `gl_suspense_allocations` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `settled_book_amount` on the `gl_suspense_allocations` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `book_amount` on the `gl_suspense_cases` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `book_amount_remaining` on the `gl_suspense_cases` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `created_at` on the `gl_suspense_cases` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `opening_fx_rate` on the `gl_suspense_cases` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `received_at` on the `gl_suspense_cases` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `resolved_at` on the `gl_suspense_cases` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `transaction_amount` on the `gl_suspense_cases` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `transaction_amount_remaining` on the `gl_suspense_cases` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `updated_at` on the `gl_suspense_cases` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `gl_trial_balance_snapshots` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `snapshot_date` on the `gl_trial_balance_snapshots` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `total_credit` on the `gl_trial_balance_snapshots` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `total_debit` on the `gl_trial_balance_snapshots` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `created_at` on the `guarantors` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `guarantee_amount` on the `guarantors` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `monthly_income` on the `guarantors` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `updated_at` on the `guarantors` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `headquarters` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `hierarchy_events` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `loan_collaterals` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `forced_sale_value` on the `loan_collaterals` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `balance` on the `loan_contract_versions` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `created_at` on the `loan_contract_versions` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `expected_total` on the `loan_contract_versions` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `interest_rate` on the `loan_contract_versions` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `principal` on the `loan_contract_versions` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `repaid_total` on the `loan_contract_versions` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `amount` on the `loan_disbursement_tranches` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `created_at` on the `loan_disbursement_tranches` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `disbursed_at` on the `loan_disbursement_tranches` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `loan_guarantors` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `guarantee_amount` on the `loan_guarantors` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `amount_due` on the `loan_installments` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `amount_paid` on the `loan_installments` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `created_at` on the `loan_installments` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `due_date` on the `loan_installments` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `paid_at` on the `loan_installments` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `penalty_amount_accrued` on the `loan_installments` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `penalty_cap_amount` on the `loan_installments` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `penalty_cap_percent_of_outstanding` on the `loan_installments` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `penalty_flat_amount` on the `loan_installments` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `penalty_last_applied_at` on the `loan_installments` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `penalty_rate_daily` on the `loan_installments` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `accrual_date` on the `loan_interest_accrual_events` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `amount` on the `loan_interest_accrual_events` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `balance_snapshot` on the `loan_interest_accrual_events` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `created_at` on the `loan_interest_accrual_events` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `accrual_start_at` on the `loan_interest_profiles` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `accrued_interest` on the `loan_interest_profiles` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `created_at` on the `loan_interest_profiles` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `last_accrual_at` on the `loan_interest_profiles` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `maturity_at` on the `loan_interest_profiles` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `total_contractual_interest` on the `loan_interest_profiles` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `updated_at` on the `loan_interest_profiles` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `loan_products` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `interest_rate` on the `loan_products` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `max_principal` on the `loan_products` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `min_principal` on the `loan_products` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `penalty_cap_amount` on the `loan_products` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `penalty_cap_percent_of_outstanding` on the `loan_products` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `penalty_flat_amount` on the `loan_products` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `penalty_rate_daily` on the `loan_products` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `processing_fee` on the `loan_products` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `registration_fee` on the `loan_products` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `updated_at` on the `loan_products` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `assessed_at` on the `loan_underwriting_assessments` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `balance` on the `loan_underwriting_assessments` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `collateral_coverage_ratio` on the `loan_underwriting_assessments` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `collateral_value_total` on the `loan_underwriting_assessments` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `estimated_monthly_installment` on the `loan_underwriting_assessments` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `estimated_weekly_installment` on the `loan_underwriting_assessments` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `expected_total` on the `loan_underwriting_assessments` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `guarantee_amount_total` on the `loan_underwriting_assessments` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `guarantee_coverage_ratio` on the `loan_underwriting_assessments` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `principal` on the `loan_underwriting_assessments` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `repayment_to_support_income_ratio` on the `loan_underwriting_assessments` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `support_income_total` on the `loan_underwriting_assessments` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `updated_at` on the `loan_underwriting_assessments` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `approved_at` on the `loans` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `archived_at` on the `loans` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `balance` on the `loans` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `created_at` on the `loans` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `disbursed_at` on the `loans` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `expected_total` on the `loans` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `interest_rate` on the `loans` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `principal` on the `loans` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `processing_fee` on the `loans` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `registration_fee` on the `loans` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `rejected_at` on the `loans` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `repaid_total` on the `loans` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `amount` on the `mobile_money_b2c_disbursements` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `created_at` on the `mobile_money_b2c_disbursements` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `reversal_last_requested_at` on the `mobile_money_b2c_disbursements` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `updated_at` on the `mobile_money_b2c_disbursements` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `amount` on the `mobile_money_c2b_events` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `created_at` on the `mobile_money_c2b_events` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `paid_at` on the `mobile_money_c2b_events` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `reconciled_at` on the `mobile_money_c2b_events` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `password_resets` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `expires_at` on the `password_resets` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `used_at` on the `password_resets` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `permissions` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `regions` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `amount` on the `repayments` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `paid_at` on the `repayments` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `role_permissions` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `amount` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `occurred_at` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `granted_at` on the `user_custom_permissions` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `created_at` on the `users` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `deactivated_at` on the `users` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to alter the column `locked_until` on the `users` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.

*/
-- DropIndex
DROP INDEX "capital_tx_created_at_idx";

-- DropIndex
DROP INDEX "capital_tx_type_idx";

-- DropIndex
DROP INDEX "capital_tx_status_idx";

-- DropIndex
DROP INDEX "capital_tx_branch_id_idx";

-- DropIndex
DROP INDEX "capital_tx_submitted_by_idx";

-- DropIndex
DROP INDEX "idx_domain_events_type_created_at";

-- DropIndex
DROP INDEX "idx_domain_events_tenant_status";

-- DropIndex
DROP INDEX "idx_domain_events_status_id";

-- DropIndex
DROP INDEX "idx_loan_overpayment_credit_client_id";

-- DropIndex
DROP INDEX "idx_loan_overpayment_credit_loan_id";

-- DropIndex
DROP INDEX "idx_loan_overpayment_credit_repayment_id";

-- DropIndex
DROP INDEX "idx_repayment_idempotency_repayment_id";

-- DropIndex
DROP INDEX "idx_repayment_idempotency_unique";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "capital_transactions";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "domain_events";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "loan_overpayment_credits";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "repayment_idempotency_keys";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "tenants";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_approval_requests" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "request_type" TEXT NOT NULL,
    "target_type" TEXT NOT NULL DEFAULT 'loan',
    "target_id" INTEGER NOT NULL,
    "loan_id" INTEGER NOT NULL,
    "branch_id" INTEGER,
    "requested_by_user_id" INTEGER NOT NULL,
    "checker_user_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "request_payload" TEXT NOT NULL,
    "request_note" TEXT,
    "review_note" TEXT,
    "requested_at" DATETIME NOT NULL,
    "reviewed_at" DATETIME,
    "approved_at" DATETIME,
    "rejected_at" DATETIME,
    "executed_at" DATETIME,
    "expires_at" DATETIME,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "approval_requests_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "approval_requests_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "approval_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "approval_requests_checker_user_id_fkey" FOREIGN KEY ("checker_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_approval_requests" ("approved_at", "branch_id", "checker_user_id", "created_at", "executed_at", "expires_at", "id", "loan_id", "rejected_at", "request_note", "request_payload", "request_type", "requested_at", "requested_by_user_id", "review_note", "reviewed_at", "status", "target_id", "target_type", "updated_at") SELECT "approved_at", "branch_id", "checker_user_id", "created_at", "executed_at", "expires_at", "id", "loan_id", "rejected_at", "request_note", "request_payload", "request_type", "requested_at", "requested_by_user_id", "review_note", "reviewed_at", "status", "target_id", "target_type", "updated_at" FROM "approval_requests";
DROP TABLE "approval_requests";
ALTER TABLE "new_approval_requests" RENAME TO "approval_requests";
CREATE INDEX "approval_requests_loan_id_idx" ON "approval_requests"("loan_id");
CREATE INDEX "approval_requests_branch_id_idx" ON "approval_requests"("branch_id");
CREATE INDEX "approval_requests_requested_by_user_id_idx" ON "approval_requests"("requested_by_user_id");
CREATE INDEX "approval_requests_checker_user_id_idx" ON "approval_requests"("checker_user_id");
CREATE INDEX "approval_requests_expires_at_idx" ON "approval_requests"("expires_at");
CREATE TABLE "new_area_manager_branch_assignments" (
    "user_id" INTEGER NOT NULL,
    "branch_id" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL,

    PRIMARY KEY ("user_id", "branch_id"),
    CONSTRAINT "area_manager_branch_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "area_manager_branch_assignments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_area_manager_branch_assignments" ("branch_id", "created_at", "user_id") SELECT "branch_id", "created_at", "user_id" FROM "area_manager_branch_assignments";
DROP TABLE "area_manager_branch_assignments";
ALTER TABLE "new_area_manager_branch_assignments" RENAME TO "area_manager_branch_assignments";
CREATE INDEX "area_manager_branch_assignments_branch_id_idx" ON "area_manager_branch_assignments"("branch_id");
CREATE TABLE "new_audit_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" INTEGER,
    "details" TEXT,
    "ip_address" TEXT,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_audit_logs" ("action", "created_at", "details", "id", "ip_address", "target_id", "target_type", "user_id") SELECT "action", "created_at", "details", "id", "ip_address", "target_id", "target_type", "user_id" FROM "audit_logs";
DROP TABLE "audit_logs";
ALTER TABLE "new_audit_logs" RENAME TO "audit_logs";
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE TABLE "new_branches" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "location_address" TEXT NOT NULL,
    "county" TEXT NOT NULL,
    "town" TEXT NOT NULL,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "region_id" INTEGER NOT NULL,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "branches_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_branches" ("code", "contact_email", "contact_phone", "county", "created_at", "id", "is_active", "location_address", "name", "region_id", "town", "updated_at") SELECT "code", "contact_email", "contact_phone", "county", "created_at", "id", "is_active", "location_address", "name", "region_id", "town", "updated_at" FROM "branches";
DROP TABLE "branches";
ALTER TABLE "new_branches" RENAME TO "branches";
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");
CREATE INDEX "branches_region_id_idx" ON "branches"("region_id");
CREATE TABLE "new_clients" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "national_id" TEXT,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" DATETIME,
    "branch_id" INTEGER,
    "created_by_user_id" INTEGER,
    "kra_pin" TEXT,
    "photo_url" TEXT,
    "id_document_url" TEXT,
    "kyc_status" TEXT NOT NULL DEFAULT 'pending',
    "onboarding_status" TEXT NOT NULL DEFAULT 'registered',
    "fee_payment_status" TEXT NOT NULL DEFAULT 'unpaid',
    "fees_paid_at" DATETIME,
    "next_of_kin_name" TEXT,
    "next_of_kin_phone" TEXT,
    "next_of_kin_relation" TEXT,
    "business_type" TEXT,
    "business_years" INTEGER,
    "business_location" TEXT,
    "residential_address" TEXT,
    "officer_id" INTEGER,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME,
    CONSTRAINT "clients_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "clients_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "clients_officer_id_fkey" FOREIGN KEY ("officer_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_clients" ("branch_id", "business_location", "business_type", "business_years", "created_at", "created_by_user_id", "deleted_at", "fee_payment_status", "fees_paid_at", "full_name", "id", "id_document_url", "is_active", "kra_pin", "kyc_status", "national_id", "next_of_kin_name", "next_of_kin_phone", "next_of_kin_relation", "officer_id", "onboarding_status", "phone", "photo_url", "residential_address", "updated_at") SELECT "branch_id", "business_location", "business_type", "business_years", "created_at", "created_by_user_id", "deleted_at", "fee_payment_status", "fees_paid_at", "full_name", "id", "id_document_url", "is_active", "kra_pin", "kyc_status", "national_id", "next_of_kin_name", "next_of_kin_phone", "next_of_kin_relation", "officer_id", "onboarding_status", "phone", "photo_url", "residential_address", "updated_at" FROM "clients";
DROP TABLE "clients";
ALTER TABLE "new_clients" RENAME TO "clients";
CREATE INDEX "clients_branch_id_idx" ON "clients"("branch_id");
CREATE INDEX "clients_created_by_user_id_idx" ON "clients"("created_by_user_id");
CREATE INDEX "idx_clients_officer_id" ON "clients"("officer_id");
CREATE INDEX "idx_clients_kyc_status" ON "clients"("kyc_status");
CREATE INDEX "idx_clients_onboarding_status" ON "clients"("onboarding_status");
CREATE INDEX "idx_clients_fee_payment_status" ON "clients"("fee_payment_status");
CREATE INDEX "idx_clients_branch_created_at" ON "clients"("branch_id", "created_at");
CREATE INDEX "idx_clients_tenant_id" ON "clients"("tenant_id");
CREATE TABLE "new_collateral_assets" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "asset_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "estimated_value" DECIMAL NOT NULL,
    "ownership_type" TEXT NOT NULL DEFAULT 'client',
    "owner_name" TEXT,
    "owner_national_id" TEXT,
    "registration_number" TEXT,
    "logbook_number" TEXT,
    "title_number" TEXT,
    "location_details" TEXT,
    "valuation_date" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "client_id" INTEGER,
    "branch_id" INTEGER,
    "created_by_user_id" INTEGER,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "collateral_assets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "collateral_assets_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "collateral_assets_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_collateral_assets" ("asset_type", "branch_id", "client_id", "created_at", "created_by_user_id", "description", "estimated_value", "id", "location_details", "logbook_number", "owner_name", "owner_national_id", "ownership_type", "registration_number", "status", "title_number", "updated_at", "valuation_date") SELECT "asset_type", "branch_id", "client_id", "created_at", "created_by_user_id", "description", "estimated_value", "id", "location_details", "logbook_number", "owner_name", "owner_national_id", "ownership_type", "registration_number", "status", "title_number", "updated_at", "valuation_date" FROM "collateral_assets";
DROP TABLE "collateral_assets";
ALTER TABLE "new_collateral_assets" RENAME TO "collateral_assets";
CREATE INDEX "collateral_assets_client_id_idx" ON "collateral_assets"("client_id");
CREATE INDEX "collateral_assets_branch_id_idx" ON "collateral_assets"("branch_id");
CREATE INDEX "collateral_assets_created_by_user_id_idx" ON "collateral_assets"("created_by_user_id");
CREATE TABLE "new_collection_actions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loan_id" INTEGER NOT NULL,
    "branch_id" INTEGER,
    "installment_id" INTEGER,
    "action_type" TEXT NOT NULL,
    "action_note" TEXT,
    "promise_date" DATETIME,
    "next_follow_up_date" DATETIME,
    "action_status" TEXT NOT NULL DEFAULT 'open',
    "created_by_user_id" INTEGER,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "collection_actions_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "collection_actions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "collection_actions_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "loan_installments" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "collection_actions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_collection_actions" ("action_note", "action_status", "action_type", "branch_id", "created_at", "created_by_user_id", "id", "installment_id", "loan_id", "next_follow_up_date", "promise_date") SELECT "action_note", "action_status", "action_type", "branch_id", "created_at", "created_by_user_id", "id", "installment_id", "loan_id", "next_follow_up_date", "promise_date" FROM "collection_actions";
DROP TABLE "collection_actions";
ALTER TABLE "new_collection_actions" RENAME TO "collection_actions";
CREATE INDEX "collection_actions_loan_id_idx" ON "collection_actions"("loan_id");
CREATE INDEX "collection_actions_branch_id_idx" ON "collection_actions"("branch_id");
CREATE INDEX "collection_actions_installment_id_idx" ON "collection_actions"("installment_id");
CREATE INDEX "idx_collection_actions_created_by_user_id" ON "collection_actions"("created_by_user_id");
CREATE INDEX "idx_collection_actions_status_follow_up_date" ON "collection_actions"("action_status", "next_follow_up_date");
CREATE TABLE "new_gl_accounts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "is_contra" INTEGER NOT NULL DEFAULT 0,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL
);
INSERT INTO "new_gl_accounts" ("account_type", "code", "created_at", "id", "is_active", "is_contra", "name") SELECT "account_type", "code", "created_at", "id", "is_active", "is_contra", "name" FROM "gl_accounts";
DROP TABLE "gl_accounts";
ALTER TABLE "new_gl_accounts" RENAME TO "gl_accounts";
CREATE UNIQUE INDEX "gl_accounts_code_key" ON "gl_accounts"("code");
CREATE TABLE "new_gl_balance_snapshots" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "batch_run_id" INTEGER,
    "snapshot_date" DATETIME NOT NULL,
    "account_id" INTEGER NOT NULL,
    "branch_id" INTEGER,
    "currency" TEXT NOT NULL,
    "debit_total" DECIMAL NOT NULL,
    "credit_total" DECIMAL NOT NULL,
    "net_balance" DECIMAL NOT NULL,
    "created_at" DATETIME NOT NULL
);
INSERT INTO "new_gl_balance_snapshots" ("account_id", "batch_run_id", "branch_id", "created_at", "credit_total", "currency", "debit_total", "id", "net_balance", "snapshot_date") SELECT "account_id", "batch_run_id", "branch_id", "created_at", "credit_total", "currency", "debit_total", "id", "net_balance", "snapshot_date" FROM "gl_balance_snapshots";
DROP TABLE "gl_balance_snapshots";
ALTER TABLE "new_gl_balance_snapshots" RENAME TO "gl_balance_snapshots";
CREATE INDEX "gl_balance_snapshots_batch_run_id_idx" ON "gl_balance_snapshots"("batch_run_id");
CREATE INDEX "gl_balance_snapshots_snapshot_date_idx" ON "gl_balance_snapshots"("snapshot_date");
CREATE INDEX "gl_balance_snapshots_account_id_idx" ON "gl_balance_snapshots"("account_id");
CREATE INDEX "gl_balance_snapshots_branch_id_idx" ON "gl_balance_snapshots"("branch_id");
CREATE UNIQUE INDEX "gl_balance_snapshots_snapshot_date_account_id_branch_id_currency_key" ON "gl_balance_snapshots"("snapshot_date", "account_id", "branch_id", "currency");
CREATE TABLE "new_gl_batch_runs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "batch_type" TEXT NOT NULL,
    "effective_date" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" DATETIME NOT NULL,
    "completed_at" DATETIME,
    "triggered_by_user_id" INTEGER,
    "summary_json" TEXT,
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL
);
INSERT INTO "new_gl_batch_runs" ("batch_type", "completed_at", "created_at", "effective_date", "error_message", "id", "started_at", "status", "summary_json", "triggered_by_user_id") SELECT "batch_type", "completed_at", "created_at", "effective_date", "error_message", "id", "started_at", "status", "summary_json", "triggered_by_user_id" FROM "gl_batch_runs";
DROP TABLE "gl_batch_runs";
ALTER TABLE "new_gl_batch_runs" RENAME TO "gl_batch_runs";
CREATE INDEX "gl_batch_runs_status_idx" ON "gl_batch_runs"("status");
CREATE INDEX "gl_batch_runs_triggered_by_user_id_idx" ON "gl_batch_runs"("triggered_by_user_id");
CREATE UNIQUE INDEX "gl_batch_runs_batch_type_effective_date_key" ON "gl_batch_runs"("batch_type", "effective_date");
CREATE TABLE "new_gl_coa_accounts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "coa_version_id" INTEGER NOT NULL,
    "base_account_id" INTEGER,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "is_contra" INTEGER NOT NULL DEFAULT 0,
    "is_posting_allowed" INTEGER NOT NULL DEFAULT 1,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_gl_coa_accounts" ("account_type", "base_account_id", "coa_version_id", "code", "created_at", "id", "is_active", "is_contra", "is_posting_allowed", "name", "updated_at") SELECT "account_type", "base_account_id", "coa_version_id", "code", "created_at", "id", "is_active", "is_contra", "is_posting_allowed", "name", "updated_at" FROM "gl_coa_accounts";
DROP TABLE "gl_coa_accounts";
ALTER TABLE "new_gl_coa_accounts" RENAME TO "gl_coa_accounts";
CREATE INDEX "gl_coa_accounts_coa_version_id_idx" ON "gl_coa_accounts"("coa_version_id");
CREATE INDEX "gl_coa_accounts_base_account_id_idx" ON "gl_coa_accounts"("base_account_id");
CREATE UNIQUE INDEX "gl_coa_accounts_coa_version_id_code_key" ON "gl_coa_accounts"("coa_version_id", "code");
CREATE TABLE "new_gl_coa_versions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "version_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "effective_from" DATETIME,
    "effective_to" DATETIME,
    "parent_version_id" INTEGER,
    "notes" TEXT,
    "created_by_user_id" INTEGER,
    "activated_by_user_id" INTEGER,
    "activated_at" DATETIME,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_gl_coa_versions" ("activated_at", "activated_by_user_id", "created_at", "created_by_user_id", "effective_from", "effective_to", "id", "name", "notes", "parent_version_id", "status", "updated_at", "version_code") SELECT "activated_at", "activated_by_user_id", "created_at", "created_by_user_id", "effective_from", "effective_to", "id", "name", "notes", "parent_version_id", "status", "updated_at", "version_code" FROM "gl_coa_versions";
DROP TABLE "gl_coa_versions";
ALTER TABLE "new_gl_coa_versions" RENAME TO "gl_coa_versions";
CREATE UNIQUE INDEX "gl_coa_versions_version_code_key" ON "gl_coa_versions"("version_code");
CREATE INDEX "gl_coa_versions_status_idx" ON "gl_coa_versions"("status");
CREATE INDEX "gl_coa_versions_parent_version_id_idx" ON "gl_coa_versions"("parent_version_id");
CREATE INDEX "gl_coa_versions_created_by_user_id_idx" ON "gl_coa_versions"("created_by_user_id");
CREATE TABLE "new_gl_entries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "journal_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "side" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "transaction_amount" DECIMAL,
    "transaction_currency" TEXT,
    "coa_version_id" INTEGER,
    "coa_account_code" TEXT,
    "coa_account_name" TEXT,
    "memo" TEXT,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "gl_entries_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "gl_journals" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "gl_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "gl_accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_gl_entries" ("account_id", "amount", "coa_account_code", "coa_account_name", "coa_version_id", "created_at", "id", "journal_id", "memo", "side", "transaction_amount", "transaction_currency") SELECT "account_id", "amount", "coa_account_code", "coa_account_name", "coa_version_id", "created_at", "id", "journal_id", "memo", "side", "transaction_amount", "transaction_currency" FROM "gl_entries";
DROP TABLE "gl_entries";
ALTER TABLE "new_gl_entries" RENAME TO "gl_entries";
CREATE INDEX "gl_entries_journal_id_idx" ON "gl_entries"("journal_id");
CREATE INDEX "gl_entries_account_id_idx" ON "gl_entries"("account_id");
CREATE INDEX "idx_gl_entries_account_created_at" ON "gl_entries"("account_id", "created_at");
CREATE TABLE "new_gl_fx_rates" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "base_currency" TEXT NOT NULL,
    "quote_currency" TEXT NOT NULL,
    "rate" DECIMAL NOT NULL,
    "source" TEXT NOT NULL,
    "quoted_at" DATETIME NOT NULL,
    "created_by_user_id" INTEGER,
    "created_at" DATETIME NOT NULL
);
INSERT INTO "new_gl_fx_rates" ("base_currency", "created_at", "created_by_user_id", "id", "quote_currency", "quoted_at", "rate", "source") SELECT "base_currency", "created_at", "created_by_user_id", "id", "quote_currency", "quoted_at", "rate", "source" FROM "gl_fx_rates";
DROP TABLE "gl_fx_rates";
ALTER TABLE "new_gl_fx_rates" RENAME TO "gl_fx_rates";
CREATE INDEX "gl_fx_rates_base_currency_quote_currency_quoted_at_idx" ON "gl_fx_rates"("base_currency", "quote_currency", "quoted_at");
CREATE INDEX "gl_fx_rates_created_by_user_id_idx" ON "gl_fx_rates"("created_by_user_id");
CREATE UNIQUE INDEX "gl_fx_rates_base_currency_quote_currency_quoted_at_key" ON "gl_fx_rates"("base_currency", "quote_currency", "quoted_at");
CREATE TABLE "new_gl_journals" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "reference_type" TEXT NOT NULL,
    "reference_id" INTEGER,
    "loan_id" INTEGER,
    "client_id" INTEGER,
    "branch_id" INTEGER,
    "base_currency" TEXT NOT NULL DEFAULT 'KES',
    "transaction_currency" TEXT NOT NULL DEFAULT 'KES',
    "exchange_rate" DECIMAL NOT NULL DEFAULT 1,
    "fx_rate_source" TEXT,
    "fx_rate_timestamp" DATETIME,
    "description" TEXT NOT NULL,
    "note" TEXT,
    "posted_by_user_id" INTEGER,
    "total_debit" DECIMAL NOT NULL,
    "total_credit" DECIMAL NOT NULL,
    "posted_at" DATETIME NOT NULL,
    "external_reference_id" TEXT,
    CONSTRAINT "gl_journals_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "gl_journals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "gl_journals_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "gl_journals_posted_by_user_id_fkey" FOREIGN KEY ("posted_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_gl_journals" ("base_currency", "branch_id", "client_id", "description", "exchange_rate", "fx_rate_source", "fx_rate_timestamp", "id", "loan_id", "note", "posted_at", "posted_by_user_id", "reference_id", "reference_type", "total_credit", "total_debit", "transaction_currency") SELECT "base_currency", "branch_id", "client_id", "description", "exchange_rate", "fx_rate_source", "fx_rate_timestamp", "id", "loan_id", "note", "posted_at", "posted_by_user_id", "reference_id", "reference_type", "total_credit", "total_debit", "transaction_currency" FROM "gl_journals";
DROP TABLE "gl_journals";
ALTER TABLE "new_gl_journals" RENAME TO "gl_journals";
CREATE INDEX "gl_journals_loan_id_idx" ON "gl_journals"("loan_id");
CREATE INDEX "gl_journals_client_id_idx" ON "gl_journals"("client_id");
CREATE INDEX "gl_journals_branch_id_idx" ON "gl_journals"("branch_id");
CREATE INDEX "gl_journals_posted_by_user_id_idx" ON "gl_journals"("posted_by_user_id");
CREATE INDEX "gl_journals_external_reference_id_idx" ON "gl_journals"("external_reference_id");
CREATE INDEX "gl_journals_tenant_id_idx" ON "gl_journals"("tenant_id");
CREATE UNIQUE INDEX "gl_journals_reference_type_reference_id_key" ON "gl_journals"("reference_type", "reference_id");
CREATE TABLE "new_gl_period_locks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "batch_run_id" INTEGER,
    "lock_type" TEXT NOT NULL,
    "lock_date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'locked',
    "note" TEXT,
    "locked_by_user_id" INTEGER,
    "locked_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL
);
INSERT INTO "new_gl_period_locks" ("batch_run_id", "created_at", "id", "lock_date", "lock_type", "locked_at", "locked_by_user_id", "note", "status") SELECT "batch_run_id", "created_at", "id", "lock_date", "lock_type", "locked_at", "locked_by_user_id", "note", "status" FROM "gl_period_locks";
DROP TABLE "gl_period_locks";
ALTER TABLE "new_gl_period_locks" RENAME TO "gl_period_locks";
CREATE INDEX "gl_period_locks_batch_run_id_idx" ON "gl_period_locks"("batch_run_id");
CREATE INDEX "gl_period_locks_locked_by_user_id_idx" ON "gl_period_locks"("locked_by_user_id");
CREATE INDEX "gl_period_locks_lock_date_idx" ON "gl_period_locks"("lock_date");
CREATE UNIQUE INDEX "gl_period_locks_lock_type_lock_date_key" ON "gl_period_locks"("lock_type", "lock_date");
CREATE TABLE "new_gl_suspense_allocations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "suspense_case_id" INTEGER NOT NULL,
    "journal_id" INTEGER NOT NULL,
    "target_account_code" TEXT NOT NULL,
    "allocated_transaction_amount" DECIMAL NOT NULL,
    "carrying_book_amount" DECIMAL NOT NULL,
    "settled_book_amount" DECIMAL NOT NULL,
    "fx_difference_amount" DECIMAL NOT NULL DEFAULT 0,
    "transaction_currency" TEXT NOT NULL,
    "book_currency" TEXT NOT NULL,
    "fx_rate" DECIMAL NOT NULL DEFAULT 1,
    "note" TEXT,
    "allocated_by_user_id" INTEGER,
    "allocated_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL
);
INSERT INTO "new_gl_suspense_allocations" ("allocated_at", "allocated_by_user_id", "allocated_transaction_amount", "book_currency", "carrying_book_amount", "created_at", "fx_difference_amount", "fx_rate", "id", "journal_id", "note", "settled_book_amount", "suspense_case_id", "target_account_code", "transaction_currency") SELECT "allocated_at", "allocated_by_user_id", "allocated_transaction_amount", "book_currency", "carrying_book_amount", "created_at", "fx_difference_amount", "fx_rate", "id", "journal_id", "note", "settled_book_amount", "suspense_case_id", "target_account_code", "transaction_currency" FROM "gl_suspense_allocations";
DROP TABLE "gl_suspense_allocations";
ALTER TABLE "new_gl_suspense_allocations" RENAME TO "gl_suspense_allocations";
CREATE INDEX "gl_suspense_allocations_suspense_case_id_idx" ON "gl_suspense_allocations"("suspense_case_id");
CREATE INDEX "gl_suspense_allocations_journal_id_idx" ON "gl_suspense_allocations"("journal_id");
CREATE INDEX "gl_suspense_allocations_allocated_by_user_id_idx" ON "gl_suspense_allocations"("allocated_by_user_id");
CREATE TABLE "new_gl_suspense_cases" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "external_reference" TEXT,
    "source_channel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "description" TEXT,
    "branch_id" INTEGER,
    "client_id" INTEGER,
    "loan_id" INTEGER,
    "transaction_currency" TEXT NOT NULL DEFAULT 'KES',
    "transaction_amount" DECIMAL NOT NULL,
    "transaction_amount_remaining" DECIMAL NOT NULL,
    "book_currency" TEXT NOT NULL DEFAULT 'KES',
    "book_amount" DECIMAL NOT NULL,
    "book_amount_remaining" DECIMAL NOT NULL,
    "opening_fx_rate" DECIMAL NOT NULL DEFAULT 1,
    "received_at" DATETIME NOT NULL,
    "created_by_user_id" INTEGER,
    "resolved_by_user_id" INTEGER,
    "resolved_at" DATETIME,
    "note" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_gl_suspense_cases" ("book_amount", "book_amount_remaining", "book_currency", "branch_id", "client_id", "created_at", "created_by_user_id", "description", "external_reference", "id", "loan_id", "note", "opening_fx_rate", "received_at", "resolved_at", "resolved_by_user_id", "source_channel", "status", "transaction_amount", "transaction_amount_remaining", "transaction_currency", "updated_at") SELECT "book_amount", "book_amount_remaining", "book_currency", "branch_id", "client_id", "created_at", "created_by_user_id", "description", "external_reference", "id", "loan_id", "note", "opening_fx_rate", "received_at", "resolved_at", "resolved_by_user_id", "source_channel", "status", "transaction_amount", "transaction_amount_remaining", "transaction_currency", "updated_at" FROM "gl_suspense_cases";
DROP TABLE "gl_suspense_cases";
ALTER TABLE "new_gl_suspense_cases" RENAME TO "gl_suspense_cases";
CREATE INDEX "gl_suspense_cases_status_idx" ON "gl_suspense_cases"("status");
CREATE INDEX "gl_suspense_cases_branch_id_idx" ON "gl_suspense_cases"("branch_id");
CREATE INDEX "gl_suspense_cases_client_id_idx" ON "gl_suspense_cases"("client_id");
CREATE INDEX "gl_suspense_cases_loan_id_idx" ON "gl_suspense_cases"("loan_id");
CREATE INDEX "gl_suspense_cases_external_reference_idx" ON "gl_suspense_cases"("external_reference");
CREATE TABLE "new_gl_trial_balance_snapshots" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "batch_run_id" INTEGER,
    "snapshot_date" DATETIME NOT NULL,
    "branch_id" INTEGER,
    "currency" TEXT NOT NULL,
    "total_debit" DECIMAL NOT NULL,
    "total_credit" DECIMAL NOT NULL,
    "balanced" INTEGER NOT NULL DEFAULT 1,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL
);
INSERT INTO "new_gl_trial_balance_snapshots" ("balanced", "batch_run_id", "branch_id", "created_at", "currency", "id", "row_count", "snapshot_date", "total_credit", "total_debit") SELECT "balanced", "batch_run_id", "branch_id", "created_at", "currency", "id", "row_count", "snapshot_date", "total_credit", "total_debit" FROM "gl_trial_balance_snapshots";
DROP TABLE "gl_trial_balance_snapshots";
ALTER TABLE "new_gl_trial_balance_snapshots" RENAME TO "gl_trial_balance_snapshots";
CREATE INDEX "gl_trial_balance_snapshots_batch_run_id_idx" ON "gl_trial_balance_snapshots"("batch_run_id");
CREATE INDEX "gl_trial_balance_snapshots_snapshot_date_idx" ON "gl_trial_balance_snapshots"("snapshot_date");
CREATE INDEX "gl_trial_balance_snapshots_branch_id_idx" ON "gl_trial_balance_snapshots"("branch_id");
CREATE TABLE "new_guarantors" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "national_id" TEXT,
    "physical_address" TEXT,
    "occupation" TEXT,
    "employer_name" TEXT,
    "monthly_income" DECIMAL NOT NULL DEFAULT 0,
    "guarantee_amount" DECIMAL NOT NULL DEFAULT 0,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "client_id" INTEGER,
    "branch_id" INTEGER,
    "created_by_user_id" INTEGER,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "guarantors_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "guarantors_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "guarantors_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_guarantors" ("branch_id", "client_id", "created_at", "created_by_user_id", "employer_name", "full_name", "guarantee_amount", "id", "is_active", "monthly_income", "national_id", "occupation", "phone", "physical_address", "updated_at") SELECT "branch_id", "client_id", "created_at", "created_by_user_id", "employer_name", "full_name", "guarantee_amount", "id", "is_active", "monthly_income", "national_id", "occupation", "phone", "physical_address", "updated_at" FROM "guarantors";
DROP TABLE "guarantors";
ALTER TABLE "new_guarantors" RENAME TO "guarantors";
CREATE INDEX "guarantors_client_id_idx" ON "guarantors"("client_id");
CREATE INDEX "guarantors_branch_id_idx" ON "guarantors"("branch_id");
CREATE INDEX "guarantors_created_by_user_id_idx" ON "guarantors"("created_by_user_id");
CREATE TABLE "new_headquarters" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "location" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "created_at" DATETIME NOT NULL
);
INSERT INTO "new_headquarters" ("code", "contact_email", "contact_phone", "created_at", "id", "location", "name") SELECT "code", "contact_email", "contact_phone", "created_at", "id", "location", "name" FROM "headquarters";
DROP TABLE "headquarters";
ALTER TABLE "new_headquarters" RENAME TO "headquarters";
CREATE UNIQUE INDEX "headquarters_code_key" ON "headquarters"("code");
CREATE TABLE "new_hierarchy_events" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "event_type" TEXT NOT NULL,
    "scope_level" TEXT NOT NULL,
    "region_id" INTEGER,
    "branch_id" INTEGER,
    "actor_user_id" INTEGER,
    "details" TEXT,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "hierarchy_events_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "hierarchy_events_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "hierarchy_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_hierarchy_events" ("actor_user_id", "branch_id", "created_at", "details", "event_type", "id", "region_id", "scope_level") SELECT "actor_user_id", "branch_id", "created_at", "details", "event_type", "id", "region_id", "scope_level" FROM "hierarchy_events";
DROP TABLE "hierarchy_events";
ALTER TABLE "new_hierarchy_events" RENAME TO "hierarchy_events";
CREATE INDEX "hierarchy_events_region_id_idx" ON "hierarchy_events"("region_id");
CREATE INDEX "hierarchy_events_branch_id_idx" ON "hierarchy_events"("branch_id");
CREATE INDEX "hierarchy_events_actor_user_id_idx" ON "hierarchy_events"("actor_user_id");
CREATE TABLE "new_loan_collaterals" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loan_id" INTEGER NOT NULL,
    "collateral_asset_id" INTEGER NOT NULL,
    "forced_sale_value" DECIMAL,
    "lien_rank" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "created_by_user_id" INTEGER,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "loan_collaterals_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "loan_collaterals_collateral_asset_id_fkey" FOREIGN KEY ("collateral_asset_id") REFERENCES "collateral_assets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "loan_collaterals_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_loan_collaterals" ("collateral_asset_id", "created_at", "created_by_user_id", "forced_sale_value", "id", "lien_rank", "loan_id", "note") SELECT "collateral_asset_id", "created_at", "created_by_user_id", "forced_sale_value", "id", "lien_rank", "loan_id", "note" FROM "loan_collaterals";
DROP TABLE "loan_collaterals";
ALTER TABLE "new_loan_collaterals" RENAME TO "loan_collaterals";
CREATE INDEX "loan_collaterals_loan_id_idx" ON "loan_collaterals"("loan_id");
CREATE INDEX "loan_collaterals_collateral_asset_id_idx" ON "loan_collaterals"("collateral_asset_id");
CREATE INDEX "loan_collaterals_created_by_user_id_idx" ON "loan_collaterals"("created_by_user_id");
CREATE UNIQUE INDEX "loan_collaterals_loan_id_collateral_asset_id_key" ON "loan_collaterals"("loan_id", "collateral_asset_id");
CREATE TABLE "new_loan_contract_versions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loan_id" INTEGER NOT NULL,
    "version_number" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "principal" DECIMAL NOT NULL,
    "interest_rate" DECIMAL NOT NULL,
    "term_weeks" INTEGER NOT NULL,
    "expected_total" DECIMAL NOT NULL,
    "repaid_total" DECIMAL NOT NULL,
    "balance" DECIMAL NOT NULL,
    "snapshot_json" TEXT,
    "note" TEXT,
    "created_by_user_id" INTEGER,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "loan_contract_versions_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "loan_contract_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_loan_contract_versions" ("balance", "created_at", "created_by_user_id", "event_type", "expected_total", "id", "interest_rate", "loan_id", "note", "principal", "repaid_total", "snapshot_json", "term_weeks", "version_number") SELECT "balance", "created_at", "created_by_user_id", "event_type", "expected_total", "id", "interest_rate", "loan_id", "note", "principal", "repaid_total", "snapshot_json", "term_weeks", "version_number" FROM "loan_contract_versions";
DROP TABLE "loan_contract_versions";
ALTER TABLE "new_loan_contract_versions" RENAME TO "loan_contract_versions";
CREATE INDEX "loan_contract_versions_loan_id_idx" ON "loan_contract_versions"("loan_id");
CREATE INDEX "loan_contract_versions_created_by_user_id_idx" ON "loan_contract_versions"("created_by_user_id");
CREATE UNIQUE INDEX "loan_contract_versions_loan_id_version_number_key" ON "loan_contract_versions"("loan_id", "version_number");
CREATE TABLE "new_loan_disbursement_tranches" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loan_id" INTEGER NOT NULL,
    "tranche_number" INTEGER NOT NULL,
    "amount" DECIMAL NOT NULL,
    "disbursed_at" DATETIME NOT NULL,
    "disbursed_by_user_id" INTEGER,
    "note" TEXT,
    "is_final" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "loan_disbursement_tranches_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "loan_disbursement_tranches_disbursed_by_user_id_fkey" FOREIGN KEY ("disbursed_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_loan_disbursement_tranches" ("amount", "created_at", "disbursed_at", "disbursed_by_user_id", "id", "is_final", "loan_id", "note", "tranche_number") SELECT "amount", "created_at", "disbursed_at", "disbursed_by_user_id", "id", "is_final", "loan_id", "note", "tranche_number" FROM "loan_disbursement_tranches";
DROP TABLE "loan_disbursement_tranches";
ALTER TABLE "new_loan_disbursement_tranches" RENAME TO "loan_disbursement_tranches";
CREATE INDEX "loan_disbursement_tranches_loan_id_idx" ON "loan_disbursement_tranches"("loan_id");
CREATE INDEX "loan_disbursement_tranches_disbursed_by_user_id_idx" ON "loan_disbursement_tranches"("disbursed_by_user_id");
CREATE UNIQUE INDEX "loan_disbursement_tranches_loan_id_tranche_number_key" ON "loan_disbursement_tranches"("loan_id", "tranche_number");
CREATE TABLE "new_loan_guarantors" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loan_id" INTEGER NOT NULL,
    "guarantor_id" INTEGER NOT NULL,
    "guarantee_amount" DECIMAL NOT NULL DEFAULT 0,
    "relationship_to_client" TEXT,
    "liability_type" TEXT NOT NULL DEFAULT 'individual',
    "note" TEXT,
    "created_by_user_id" INTEGER,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "loan_guarantors_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "loan_guarantors_guarantor_id_fkey" FOREIGN KEY ("guarantor_id") REFERENCES "guarantors" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "loan_guarantors_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_loan_guarantors" ("created_at", "created_by_user_id", "guarantee_amount", "guarantor_id", "id", "liability_type", "loan_id", "note", "relationship_to_client") SELECT "created_at", "created_by_user_id", "guarantee_amount", "guarantor_id", "id", "liability_type", "loan_id", "note", "relationship_to_client" FROM "loan_guarantors";
DROP TABLE "loan_guarantors";
ALTER TABLE "new_loan_guarantors" RENAME TO "loan_guarantors";
CREATE INDEX "loan_guarantors_loan_id_idx" ON "loan_guarantors"("loan_id");
CREATE INDEX "loan_guarantors_guarantor_id_idx" ON "loan_guarantors"("guarantor_id");
CREATE INDEX "loan_guarantors_created_by_user_id_idx" ON "loan_guarantors"("created_by_user_id");
CREATE UNIQUE INDEX "loan_guarantors_loan_id_guarantor_id_key" ON "loan_guarantors"("loan_id", "guarantor_id");
CREATE TABLE "new_loan_installments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loan_id" INTEGER NOT NULL,
    "installment_number" INTEGER NOT NULL,
    "due_date" DATETIME NOT NULL,
    "amount_due" DECIMAL NOT NULL,
    "amount_paid" DECIMAL NOT NULL DEFAULT 0,
    "penalty_amount_accrued" DECIMAL NOT NULL DEFAULT 0,
    "penalty_last_applied_at" DATETIME,
    "penalty_rate_daily" DECIMAL,
    "penalty_flat_amount" DECIMAL,
    "penalty_grace_days" INTEGER,
    "penalty_cap_amount" DECIMAL,
    "penalty_compounding_method" TEXT,
    "penalty_base_amount" TEXT,
    "penalty_cap_percent_of_outstanding" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paid_at" DATETIME,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "loan_installments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_loan_installments" ("amount_due", "amount_paid", "created_at", "due_date", "id", "installment_number", "loan_id", "paid_at", "penalty_amount_accrued", "penalty_base_amount", "penalty_cap_amount", "penalty_cap_percent_of_outstanding", "penalty_compounding_method", "penalty_flat_amount", "penalty_grace_days", "penalty_last_applied_at", "penalty_rate_daily", "status") SELECT "amount_due", "amount_paid", "created_at", "due_date", "id", "installment_number", "loan_id", "paid_at", "penalty_amount_accrued", "penalty_base_amount", "penalty_cap_amount", "penalty_cap_percent_of_outstanding", "penalty_compounding_method", "penalty_flat_amount", "penalty_grace_days", "penalty_last_applied_at", "penalty_rate_daily", "status" FROM "loan_installments";
DROP TABLE "loan_installments";
ALTER TABLE "new_loan_installments" RENAME TO "loan_installments";
CREATE INDEX "loan_installments_loan_id_idx" ON "loan_installments"("loan_id");
CREATE INDEX "idx_installments_loan_status_due_date" ON "loan_installments"("loan_id", "status", "due_date");
CREATE INDEX "idx_installments_due_status_loan_id" ON "loan_installments"("due_date", "status", "loan_id");
CREATE TABLE "new_loan_interest_accrual_events" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loan_id" INTEGER NOT NULL,
    "accrual_date" DATETIME NOT NULL,
    "amount" DECIMAL NOT NULL,
    "days_accrued" INTEGER NOT NULL DEFAULT 0,
    "balance_snapshot" DECIMAL,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "loan_interest_accrual_events_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_loan_interest_accrual_events" ("accrual_date", "amount", "balance_snapshot", "created_at", "days_accrued", "id", "loan_id") SELECT "accrual_date", "amount", "balance_snapshot", "created_at", "days_accrued", "id", "loan_id" FROM "loan_interest_accrual_events";
DROP TABLE "loan_interest_accrual_events";
ALTER TABLE "new_loan_interest_accrual_events" RENAME TO "loan_interest_accrual_events";
CREATE INDEX "loan_interest_accrual_events_loan_id_idx" ON "loan_interest_accrual_events"("loan_id");
CREATE UNIQUE INDEX "loan_interest_accrual_events_loan_id_accrual_date_key" ON "loan_interest_accrual_events"("loan_id", "accrual_date");
CREATE TABLE "new_loan_interest_profiles" (
    "loan_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "accrual_method" TEXT NOT NULL DEFAULT 'upfront',
    "accrual_basis" TEXT NOT NULL DEFAULT 'flat',
    "accrual_start_at" DATETIME,
    "maturity_at" DATETIME,
    "total_contractual_interest" DECIMAL NOT NULL DEFAULT 0,
    "accrued_interest" DECIMAL NOT NULL DEFAULT 0,
    "last_accrual_at" DATETIME,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "loan_interest_profiles_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_loan_interest_profiles" ("accrual_basis", "accrual_method", "accrual_start_at", "accrued_interest", "created_at", "last_accrual_at", "loan_id", "maturity_at", "total_contractual_interest", "updated_at") SELECT "accrual_basis", "accrual_method", "accrual_start_at", "accrued_interest", "created_at", "last_accrual_at", "loan_id", "maturity_at", "total_contractual_interest", "updated_at" FROM "loan_interest_profiles";
DROP TABLE "loan_interest_profiles";
ALTER TABLE "new_loan_interest_profiles" RENAME TO "loan_interest_profiles";
CREATE TABLE "new_loan_products" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "interest_rate" DECIMAL NOT NULL,
    "interest_accrual_method" TEXT NOT NULL DEFAULT 'upfront',
    "registration_fee" DECIMAL NOT NULL DEFAULT 0,
    "processing_fee" DECIMAL NOT NULL DEFAULT 0,
    "penalty_rate_daily" DECIMAL NOT NULL DEFAULT 0,
    "penalty_flat_amount" DECIMAL NOT NULL DEFAULT 0,
    "penalty_grace_days" INTEGER NOT NULL DEFAULT 0,
    "penalty_cap_amount" DECIMAL,
    "penalty_compounding_method" TEXT NOT NULL DEFAULT 'simple',
    "penalty_base_amount" TEXT NOT NULL DEFAULT 'installment_outstanding',
    "penalty_cap_percent_of_outstanding" DECIMAL,
    "pricing_strategy" TEXT NOT NULL DEFAULT 'flat_rate',
    "pricing_config" TEXT,
    "min_principal" DECIMAL NOT NULL DEFAULT 1,
    "max_principal" DECIMAL NOT NULL DEFAULT 1000000,
    "min_term_weeks" INTEGER NOT NULL,
    "max_term_weeks" INTEGER NOT NULL,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME
);
INSERT INTO "new_loan_products" ("created_at", "id", "interest_accrual_method", "interest_rate", "is_active", "max_principal", "max_term_weeks", "min_principal", "min_term_weeks", "name", "penalty_base_amount", "penalty_cap_amount", "penalty_cap_percent_of_outstanding", "penalty_compounding_method", "penalty_flat_amount", "penalty_grace_days", "penalty_rate_daily", "processing_fee", "registration_fee", "updated_at") SELECT "created_at", "id", "interest_accrual_method", "interest_rate", "is_active", "max_principal", "max_term_weeks", "min_principal", "min_term_weeks", "name", "penalty_base_amount", "penalty_cap_amount", "penalty_cap_percent_of_outstanding", "penalty_compounding_method", "penalty_flat_amount", "penalty_grace_days", "penalty_rate_daily", "processing_fee", "registration_fee", "updated_at" FROM "loan_products";
DROP TABLE "loan_products";
ALTER TABLE "new_loan_products" RENAME TO "loan_products";
CREATE TABLE "new_loan_underwriting_assessments" (
    "loan_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "client_id" INTEGER NOT NULL,
    "branch_id" INTEGER,
    "principal" DECIMAL NOT NULL,
    "expected_total" DECIMAL NOT NULL,
    "balance" DECIMAL NOT NULL,
    "term_weeks" INTEGER NOT NULL,
    "guarantor_count" INTEGER NOT NULL DEFAULT 0,
    "collateral_count" INTEGER NOT NULL DEFAULT 0,
    "support_income_total" DECIMAL NOT NULL DEFAULT 0,
    "estimated_weekly_installment" DECIMAL NOT NULL DEFAULT 0,
    "estimated_monthly_installment" DECIMAL NOT NULL DEFAULT 0,
    "repayment_to_support_income_ratio" DECIMAL,
    "collateral_value_total" DECIMAL NOT NULL DEFAULT 0,
    "collateral_coverage_ratio" DECIMAL,
    "guarantee_amount_total" DECIMAL NOT NULL DEFAULT 0,
    "guarantee_coverage_ratio" DECIMAL,
    "business_years" INTEGER,
    "kyc_status" TEXT NOT NULL DEFAULT 'pending',
    "risk_band" TEXT NOT NULL DEFAULT 'medium',
    "policy_decision" TEXT NOT NULL DEFAULT 'manual_review',
    "flags_json" TEXT,
    "assessment_json" TEXT,
    "override_decision" TEXT,
    "override_reason" TEXT,
    "assessed_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "loan_underwriting_assessments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_loan_underwriting_assessments" ("assessed_at", "assessment_json", "balance", "branch_id", "business_years", "client_id", "collateral_count", "collateral_coverage_ratio", "collateral_value_total", "estimated_monthly_installment", "estimated_weekly_installment", "expected_total", "flags_json", "guarantee_amount_total", "guarantee_coverage_ratio", "guarantor_count", "kyc_status", "loan_id", "override_decision", "override_reason", "policy_decision", "principal", "repayment_to_support_income_ratio", "risk_band", "support_income_total", "term_weeks", "updated_at") SELECT "assessed_at", "assessment_json", "balance", "branch_id", "business_years", "client_id", "collateral_count", "collateral_coverage_ratio", "collateral_value_total", "estimated_monthly_installment", "estimated_weekly_installment", "expected_total", "flags_json", "guarantee_amount_total", "guarantee_coverage_ratio", "guarantor_count", "kyc_status", "loan_id", "override_decision", "override_reason", "policy_decision", "principal", "repayment_to_support_income_ratio", "risk_band", "support_income_total", "term_weeks", "updated_at" FROM "loan_underwriting_assessments";
DROP TABLE "loan_underwriting_assessments";
ALTER TABLE "new_loan_underwriting_assessments" RENAME TO "loan_underwriting_assessments";
CREATE INDEX "loan_underwriting_assessments_client_id_idx" ON "loan_underwriting_assessments"("client_id");
CREATE INDEX "loan_underwriting_assessments_branch_id_idx" ON "loan_underwriting_assessments"("branch_id");
CREATE TABLE "new_loans" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "client_id" INTEGER NOT NULL,
    "product_id" INTEGER,
    "branch_id" INTEGER,
    "created_by_user_id" INTEGER,
    "principal" DECIMAL NOT NULL,
    "interest_rate" DECIMAL NOT NULL,
    "term_months" INTEGER NOT NULL,
    "term_weeks" INTEGER,
    "registration_fee" DECIMAL NOT NULL DEFAULT 0,
    "processing_fee" DECIMAL NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL,
    "disbursed_at" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending_approval',
    "officer_id" INTEGER,
    "disbursed_by_user_id" INTEGER,
    "disbursement_note" TEXT,
    "approved_by_user_id" INTEGER,
    "approved_at" DATETIME,
    "rejected_by_user_id" INTEGER,
    "rejected_at" DATETIME,
    "rejection_reason" TEXT,
    "archived_at" DATETIME,
    "expected_total" DECIMAL NOT NULL,
    "repaid_total" DECIMAL NOT NULL DEFAULT 0,
    "balance" DECIMAL NOT NULL,
    "external_reference" TEXT,
    CONSTRAINT "loans_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "loans_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "loan_products" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "loans_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "loans_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "loans_officer_id_fkey" FOREIGN KEY ("officer_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "loans_disbursed_by_user_id_fkey" FOREIGN KEY ("disbursed_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "loans_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "loans_rejected_by_user_id_fkey" FOREIGN KEY ("rejected_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_loans" ("approved_at", "approved_by_user_id", "archived_at", "balance", "branch_id", "client_id", "created_at", "created_by_user_id", "disbursed_at", "disbursed_by_user_id", "disbursement_note", "expected_total", "external_reference", "id", "interest_rate", "officer_id", "principal", "processing_fee", "product_id", "registration_fee", "rejected_at", "rejected_by_user_id", "rejection_reason", "repaid_total", "status", "term_months", "term_weeks") SELECT "approved_at", "approved_by_user_id", "archived_at", "balance", "branch_id", "client_id", "created_at", "created_by_user_id", "disbursed_at", "disbursed_by_user_id", "disbursement_note", "expected_total", "external_reference", "id", "interest_rate", "officer_id", "principal", "processing_fee", "product_id", "registration_fee", "rejected_at", "rejected_by_user_id", "rejection_reason", "repaid_total", "status", "term_months", "term_weeks" FROM "loans";
DROP TABLE "loans";
ALTER TABLE "new_loans" RENAME TO "loans";
CREATE INDEX "loans_client_id_idx" ON "loans"("client_id");
CREATE INDEX "loans_product_id_idx" ON "loans"("product_id");
CREATE INDEX "loans_branch_id_idx" ON "loans"("branch_id");
CREATE INDEX "loans_created_by_user_id_idx" ON "loans"("created_by_user_id");
CREATE INDEX "idx_loans_officer_id" ON "loans"("officer_id");
CREATE INDEX "loans_disbursed_by_user_id_idx" ON "loans"("disbursed_by_user_id");
CREATE INDEX "loans_approved_by_user_id_idx" ON "loans"("approved_by_user_id");
CREATE INDEX "loans_rejected_by_user_id_idx" ON "loans"("rejected_by_user_id");
CREATE INDEX "idx_loans_external_reference" ON "loans"("external_reference");
CREATE INDEX "idx_loans_status" ON "loans"("status");
CREATE INDEX "idx_loans_created_at" ON "loans"("created_at");
CREATE INDEX "idx_loans_branch_status" ON "loans"("branch_id", "status");
CREATE INDEX "idx_loans_branch_disbursed_at" ON "loans"("branch_id", "disbursed_at");
CREATE INDEX "idx_loans_created_by_disbursed_at" ON "loans"("created_by_user_id", "disbursed_at");
CREATE INDEX "idx_loans_tenant_id" ON "loans"("tenant_id");
CREATE TABLE "new_mobile_money_b2c_disbursements" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "request_id" TEXT NOT NULL,
    "loan_id" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "phone_number" TEXT NOT NULL,
    "account_reference" TEXT NOT NULL,
    "narration" TEXT,
    "initiated_by_user_id" INTEGER,
    "provider_request_id" TEXT,
    "provider_response_json" TEXT,
    "status" TEXT NOT NULL,
    "failure_reason" TEXT,
    "reversal_attempts" INTEGER NOT NULL DEFAULT 0,
    "reversal_last_requested_at" DATETIME,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "mobile_money_b2c_disbursements_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "mobile_money_b2c_disbursements_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_mobile_money_b2c_disbursements" ("account_reference", "amount", "created_at", "failure_reason", "id", "initiated_by_user_id", "loan_id", "narration", "phone_number", "provider", "provider_request_id", "provider_response_json", "request_id", "reversal_attempts", "reversal_last_requested_at", "status", "updated_at") SELECT "account_reference", "amount", "created_at", "failure_reason", "id", "initiated_by_user_id", "loan_id", "narration", "phone_number", "provider", "provider_request_id", "provider_response_json", "request_id", "reversal_attempts", "reversal_last_requested_at", "status", "updated_at" FROM "mobile_money_b2c_disbursements";
DROP TABLE "mobile_money_b2c_disbursements";
ALTER TABLE "new_mobile_money_b2c_disbursements" RENAME TO "mobile_money_b2c_disbursements";
CREATE UNIQUE INDEX "mobile_money_b2c_disbursements_request_id_key" ON "mobile_money_b2c_disbursements"("request_id");
CREATE INDEX "mobile_money_b2c_disbursements_loan_id_idx" ON "mobile_money_b2c_disbursements"("loan_id");
CREATE INDEX "mobile_money_b2c_disbursements_initiated_by_user_id_idx" ON "mobile_money_b2c_disbursements"("initiated_by_user_id");
CREATE TABLE "new_mobile_money_c2b_events" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "provider" TEXT NOT NULL,
    "external_receipt" TEXT NOT NULL,
    "account_reference" TEXT NOT NULL,
    "payer_phone" TEXT,
    "amount" DECIMAL NOT NULL,
    "paid_at" DATETIME NOT NULL,
    "payload_json" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "loan_id" INTEGER,
    "repayment_id" INTEGER,
    "reconciliation_note" TEXT,
    "reconciled_at" DATETIME,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "mobile_money_c2b_events_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "mobile_money_c2b_events_repayment_id_fkey" FOREIGN KEY ("repayment_id") REFERENCES "repayments" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_mobile_money_c2b_events" ("account_reference", "amount", "created_at", "external_receipt", "id", "loan_id", "paid_at", "payer_phone", "payload_json", "provider", "reconciled_at", "reconciliation_note", "repayment_id", "status") SELECT "account_reference", "amount", "created_at", "external_receipt", "id", "loan_id", "paid_at", "payer_phone", "payload_json", "provider", "reconciled_at", "reconciliation_note", "repayment_id", "status" FROM "mobile_money_c2b_events";
DROP TABLE "mobile_money_c2b_events";
ALTER TABLE "new_mobile_money_c2b_events" RENAME TO "mobile_money_c2b_events";
CREATE UNIQUE INDEX "mobile_money_c2b_events_external_receipt_key" ON "mobile_money_c2b_events"("external_receipt");
CREATE INDEX "mobile_money_c2b_events_loan_id_idx" ON "mobile_money_c2b_events"("loan_id");
CREATE INDEX "mobile_money_c2b_events_repayment_id_idx" ON "mobile_money_c2b_events"("repayment_id");
CREATE INDEX "idx_mobile_money_c2b_status" ON "mobile_money_c2b_events"("status");
CREATE TABLE "new_password_resets" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "used_at" DATETIME,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_password_resets" ("created_at", "expires_at", "id", "token_hash", "used_at", "user_id") SELECT "created_at", "expires_at", "id", "token_hash", "used_at", "user_id" FROM "password_resets";
DROP TABLE "password_resets";
ALTER TABLE "new_password_resets" RENAME TO "password_resets";
CREATE UNIQUE INDEX "password_resets_token_hash_key" ON "password_resets"("token_hash");
CREATE INDEX "password_resets_user_id_idx" ON "password_resets"("user_id");
CREATE TABLE "new_permissions" (
    "permission_id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL
);
INSERT INTO "new_permissions" ("created_at", "description", "permission_id") SELECT "created_at", "description", "permission_id" FROM "permissions";
DROP TABLE "permissions";
ALTER TABLE "new_permissions" RENAME TO "permissions";
CREATE TABLE "new_regions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hq_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "regions_hq_id_fkey" FOREIGN KEY ("hq_id") REFERENCES "headquarters" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_regions" ("code", "created_at", "hq_id", "id", "is_active", "name") SELECT "code", "created_at", "hq_id", "id", "is_active", "name" FROM "regions";
DROP TABLE "regions";
ALTER TABLE "new_regions" RENAME TO "regions";
CREATE UNIQUE INDEX "regions_name_key" ON "regions"("name");
CREATE UNIQUE INDEX "regions_code_key" ON "regions"("code");
CREATE INDEX "regions_hq_id_idx" ON "regions"("hq_id");
CREATE TABLE "new_repayments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "loan_id" INTEGER NOT NULL,
    "recorded_by_user_id" INTEGER,
    "amount" DECIMAL NOT NULL,
    "applied_amount" DECIMAL NOT NULL DEFAULT 0,
    "penalty_amount" DECIMAL NOT NULL DEFAULT 0,
    "interest_amount" DECIMAL NOT NULL DEFAULT 0,
    "principal_amount" DECIMAL NOT NULL DEFAULT 0,
    "overpayment_amount" DECIMAL NOT NULL DEFAULT 0,
    "paid_at" DATETIME NOT NULL,
    "note" TEXT,
    "payment_channel" TEXT NOT NULL DEFAULT 'manual',
    "payment_provider" TEXT,
    "external_receipt" TEXT,
    "external_reference" TEXT,
    "payer_phone" TEXT,
    CONSTRAINT "repayments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "repayments_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_repayments" ("amount", "external_receipt", "external_reference", "id", "loan_id", "note", "paid_at", "payer_phone", "payment_channel", "payment_provider", "recorded_by_user_id") SELECT "amount", "external_receipt", "external_reference", "id", "loan_id", "note", "paid_at", "payer_phone", "payment_channel", "payment_provider", "recorded_by_user_id" FROM "repayments";
DROP TABLE "repayments";
ALTER TABLE "new_repayments" RENAME TO "repayments";
CREATE UNIQUE INDEX "repayments_external_receipt_key" ON "repayments"("external_receipt");
CREATE INDEX "repayments_loan_id_idx" ON "repayments"("loan_id");
CREATE INDEX "idx_repayments_recorded_by_user_id" ON "repayments"("recorded_by_user_id");
CREATE INDEX "idx_repayments_external_reference" ON "repayments"("external_reference");
CREATE INDEX "idx_repayments_paid_at" ON "repayments"("paid_at");
CREATE INDEX "idx_repayments_loan_paid_at" ON "repayments"("loan_id", "paid_at");
CREATE INDEX "idx_repayments_recorded_by_paid_at" ON "repayments"("recorded_by_user_id", "paid_at");
CREATE INDEX "idx_repayments_tenant_id" ON "repayments"("tenant_id");
CREATE TABLE "new_role_permissions" (
    "role" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL,

    PRIMARY KEY ("role", "permission_id"),
    CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions" ("permission_id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_role_permissions" ("created_at", "permission_id", "role") SELECT "created_at", "permission_id", "role" FROM "role_permissions";
DROP TABLE "role_permissions";
ALTER TABLE "new_role_permissions" RENAME TO "role_permissions";
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");
CREATE TABLE "new_transactions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loan_id" INTEGER,
    "client_id" INTEGER,
    "branch_id" INTEGER,
    "tx_type" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "occurred_at" DATETIME NOT NULL,
    "note" TEXT,
    CONSTRAINT "transactions_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "transactions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "transactions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_transactions" ("amount", "branch_id", "client_id", "id", "loan_id", "note", "occurred_at", "tx_type") SELECT "amount", "branch_id", "client_id", "id", "loan_id", "note", "occurred_at", "tx_type" FROM "transactions";
DROP TABLE "transactions";
ALTER TABLE "new_transactions" RENAME TO "transactions";
CREATE INDEX "transactions_loan_id_idx" ON "transactions"("loan_id");
CREATE INDEX "transactions_client_id_idx" ON "transactions"("client_id");
CREATE INDEX "transactions_branch_id_idx" ON "transactions"("branch_id");
CREATE INDEX "idx_transactions_tx_type_occurred_at" ON "transactions"("tx_type", "occurred_at");
CREATE TABLE "new_user_custom_permissions" (
    "user_id" INTEGER NOT NULL,
    "permission_id" TEXT NOT NULL,
    "granted_at" DATETIME NOT NULL,
    "granted_by_user_id" INTEGER,

    PRIMARY KEY ("user_id", "permission_id"),
    CONSTRAINT "user_custom_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_custom_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions" ("permission_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_custom_permissions_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_user_custom_permissions" ("granted_at", "granted_by_user_id", "permission_id", "user_id") SELECT "granted_at", "granted_by_user_id", "permission_id", "user_id" FROM "user_custom_permissions";
DROP TABLE "user_custom_permissions";
ALTER TABLE "new_user_custom_permissions" RENAME TO "user_custom_permissions";
CREATE INDEX "user_custom_permissions_permission_id_idx" ON "user_custom_permissions"("permission_id");
CREATE INDEX "user_custom_permissions_granted_by_user_id_idx" ON "user_custom_permissions"("granted_by_user_id");
CREATE TABLE "new_users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "deactivated_at" DATETIME,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" DATETIME,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "branch_id" INTEGER,
    "primary_region_id" INTEGER,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "users_primary_region_id_fkey" FOREIGN KEY ("primary_region_id") REFERENCES "regions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_users" ("branch_id", "created_at", "deactivated_at", "email", "failed_login_attempts", "full_name", "id", "is_active", "locked_until", "password_hash", "primary_region_id", "role", "token_version") SELECT "branch_id", "created_at", "deactivated_at", "email", "failed_login_attempts", "full_name", "id", "is_active", "locked_until", "password_hash", "primary_region_id", "role", "token_version" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_branch_id_idx" ON "users"("branch_id");
CREATE INDEX "users_primary_region_id_idx" ON "users"("primary_region_id");
CREATE INDEX "idx_users_role_active" ON "users"("role", "is_active");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
 
 - -   P o s t g r e s   t e n a n t   R L S   s t a r t e r   s c r i p t .  
 - -   A p p l y   a f t e r   t e n a n t _ i d   c o l u m n s   e x i s t   o n   b u s i n e s s   t a b l e s .  
  
 - -   1 )   S e s s i o n   v a r i a b l e   h e l p e r   ( s e t   b y   a p p   p e r   r e q u e s t   /   c o n n e c t i o n )  
 - -   E x a m p l e   i n   a p p   s e s s i o n :  
 - -       S E T   a p p . t e n a n t _ i d   =   ' t e n a n t _ a c m e ' ;  
  
 - -   2 )   E n a b l e   R L S  
 A L T E R   T A B L E   c l i e n t s   E N A B L E   R O W   L E V E L   S E C U R I T Y ;  
 A L T E R   T A B L E   l o a n s   E N A B L E   R O W   L E V E L   S E C U R I T Y ;  
 A L T E R   T A B L E   r e p a y m e n t s   E N A B L E   R O W   L E V E L   S E C U R I T Y ;  
 A L T E R   T A B L E   g l _ j o u r n a l s   E N A B L E   R O W   L E V E L   S E C U R I T Y ;  
  
 - -   3 )   R e a d / w r i t e   p o l i c i e s  
 C R E A T E   P O L I C Y   c l i e n t s _ t e n a n t _ p o l i c y   O N   c l i e n t s  
     U S I N G   ( t e n a n t _ i d   =   c u r r e n t _ s e t t i n g ( ' a p p . t e n a n t _ i d ' ,   t r u e ) )  
     W I T H   C H E C K   ( t e n a n t _ i d   =   c u r r e n t _ s e t t i n g ( ' a p p . t e n a n t _ i d ' ,   t r u e ) ) ;  
  
 C R E A T E   P O L I C Y   l o a n s _ t e n a n t _ p o l i c y   O N   l o a n s  
     U S I N G   ( t e n a n t _ i d   =   c u r r e n t _ s e t t i n g ( ' a p p . t e n a n t _ i d ' ,   t r u e ) )  
     W I T H   C H E C K   ( t e n a n t _ i d   =   c u r r e n t _ s e t t i n g ( ' a p p . t e n a n t _ i d ' ,   t r u e ) ) ;  
  
 C R E A T E   P O L I C Y   r e p a y m e n t s _ t e n a n t _ p o l i c y   O N   r e p a y m e n t s  
     U S I N G   ( t e n a n t _ i d   =   c u r r e n t _ s e t t i n g ( ' a p p . t e n a n t _ i d ' ,   t r u e ) )  
     W I T H   C H E C K   ( t e n a n t _ i d   =   c u r r e n t _ s e t t i n g ( ' a p p . t e n a n t _ i d ' ,   t r u e ) ) ;  
  
 C R E A T E   P O L I C Y   g l _ j o u r n a l s _ t e n a n t _ p o l i c y   O N   g l _ j o u r n a l s  
     U S I N G   ( t e n a n t _ i d   =   c u r r e n t _ s e t t i n g ( ' a p p . t e n a n t _ i d ' ,   t r u e ) )  
     W I T H   C H E C K   ( t e n a n t _ i d   =   c u r r e n t _ s e t t i n g ( ' a p p . t e n a n t _ i d ' ,   t r u e ) ) ;  
  
 - -   4 )   O p t i o n a l   s t r i c t n e s s :   f o r c e   R L S   e v e n   f o r   t a b l e   o w n e r  
 - -   A L T E R   T A B L E   c l i e n t s   F O R C E   R O W   L E V E L   S E C U R I T Y ;  
 - -   A L T E R   T A B L E   l o a n s   F O R C E   R O W   L E V E L   S E C U R I T Y ;  
 - -   A L T E R   T A B L E   r e p a y m e n t s   F O R C E   R O W   L E V E L   S E C U R I T Y ;  
 - -   A L T E R   T A B L E   g l _ j o u r n a l s   F O R C E   R O W   L E V E L   S E C U R I T Y ;  
  
 - -   5 )   R e c o m m e n d e d   t e n a n t - s c o p e d   u n i q u e   c o n s t r a i n t s  
 - -   C R E A T E   U N I Q U E   I N D E X   u q _ u s e r s _ t e n a n t _ e m a i l   O N   u s e r s ( t e n a n t _ i d ,   e m a i l ) ;  
 