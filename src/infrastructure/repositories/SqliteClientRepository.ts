import type { DbRunResult } from "../../types/dataLayer.js";
import { DomainConflictError } from "../../domain/errors.js";
import { getCurrentTenantId } from "../../utils/tenantStore.js";
import type { IClientRepository } from "../../domain/client/repositories/IClientRepository.js";
import { Client, type ClientProps } from "../../domain/client/entities/Client.js";
import { ClientId } from "../../domain/client/value-objects/ClientId.js";
import { NationalId } from "../../domain/client/value-objects/NationalId.js";
import { PhoneNumber } from "../../domain/client/value-objects/PhoneNumber.js";
import { KycStatus } from "../../domain/client/value-objects/KycStatus.js";
import { OnboardingStatus } from "../../domain/client/value-objects/OnboardingStatus.js";
import { FeePaymentStatus } from "../../domain/client/value-objects/FeePaymentStatus.js";

type DbGet = (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
type DbAll = (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
type DbRun = (sql: string, params?: unknown[]) => Promise<DbRunResult>;

export interface SqliteClientRepositoryDeps {
  get: DbGet;
  all: DbAll;
  run: DbRun;
  executeTransaction?: (callback: (tx: { get: DbGet; run: DbRun }) => Promise<unknown>) => Promise<unknown>;
}

/**
 * SQLite adapter for IClientRepository.
 * Uses the same raw SQL get/all/run pattern as the existing service layer.
 *
 * Mapping convention: DB column snake_case <-> domain camelCase via rowToProps().
 */
export class SqliteClientRepository implements IClientRepository {
  constructor(private readonly deps: SqliteClientRepositoryDeps) {}

  // ------------------------------------------------------------------
  // IClientRepository implementation
  // ------------------------------------------------------------------

  /**
   * Atomically check for duplicate national_id + INSERT.
   * Returns the DB-assigned numeric id.
   * Throws DomainConflictError on duplicate national_id.
   */
  async create(client: Client): Promise<number> {
    const d = client.toPersistence();
    const normalizedNationalId = d["national_id"]
      ? String(d["national_id"]).replace(/[\s-]/g, "").toLowerCase()
      : null;

    const runInsert = async (db: { get: DbGet; run: DbRun }): Promise<number> => {
      if (normalizedNationalId) {
        const tenantId = getCurrentTenantId();
        const dup = await db.get(
          `SELECT id FROM clients
           WHERE tenant_id = ?
             AND national_id IS NOT NULL
             AND LOWER(REPLACE(REPLACE(TRIM(national_id), ' ', ''), '-', '')) = ?`,
          [tenantId, normalizedNationalId],
        );
        if (dup?.id) {
          throw new DomainConflictError("A client with this national ID already exists");
        }
      }

      const tenantId = getCurrentTenantId();
      const result = await db.run(
        `INSERT INTO clients (
          tenant_id,
          full_name, phone, national_id, branch_id, officer_id, created_by_user_id,
          kyc_status, onboarding_status, fee_payment_status, fees_paid_at,
          kra_pin, photo_url, id_document_url,
          next_of_kin_name, next_of_kin_phone, next_of_kin_relation,
          business_type, business_years, business_location, residential_address,
          latitude, longitude, location_accuracy_meters, location_captured_at,
          is_active, deleted_at, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          d["tenant_id"] || tenantId,
          d["full_name"], d["phone"], d["national_id"], d["branch_id"],
          d["officer_id"], d["created_by_user_id"],
          d["kyc_status"], d["onboarding_status"], d["fee_payment_status"], d["fees_paid_at"],
          d["kra_pin"], d["photo_url"], d["id_document_url"],
          d["next_of_kin_name"], d["next_of_kin_phone"], d["next_of_kin_relation"],
          d["business_type"], d["business_years"], d["business_location"], d["residential_address"],
          d["latitude"], d["longitude"], d["location_accuracy_meters"], d["location_captured_at"],
          d["is_active"] ?? 1, d["deleted_at"] ?? null, d["created_at"], d["updated_at"],
        ],
      );

      return Number(result.lastID || 0);
    };

    if (this.deps.executeTransaction) {
      return await this.deps.executeTransaction(
        (tx) => runInsert(tx as { get: DbGet; run: DbRun }),
      ) as number;
    }

    return runInsert(this.deps);
  }

  async save(client: Client): Promise<void> {
    const d = client.toPersistence();
    const tenantId = getCurrentTenantId();
    const persist = async (db: { get: DbGet; run: DbRun }) => {
      const existing = await db.get(
        "SELECT id FROM clients WHERE id = ? AND tenant_id = ?",
        [d["id"], tenantId],
      );

      if (existing) {
        await db.run(
          `UPDATE clients SET
            full_name = ?, phone = ?, national_id = ?, branch_id = ?, officer_id = ?,
            kyc_status = ?, onboarding_status = ?, fee_payment_status = ?, fees_paid_at = ?,
            kra_pin = ?, photo_url = ?, id_document_url = ?,
            next_of_kin_name = ?, next_of_kin_phone = ?, next_of_kin_relation = ?,
            business_type = ?, business_years = ?, business_location = ?, residential_address = ?,
            latitude = ?, longitude = ?, location_accuracy_meters = ?, location_captured_at = ?,
            is_active = ?, deleted_at = ?, updated_at = ?
          WHERE id = ? AND tenant_id = ?`,
          [
            d["full_name"], d["phone"], d["national_id"], d["branch_id"], d["officer_id"],
            d["kyc_status"], d["onboarding_status"], d["fee_payment_status"], d["fees_paid_at"],
            d["kra_pin"], d["photo_url"], d["id_document_url"],
            d["next_of_kin_name"], d["next_of_kin_phone"], d["next_of_kin_relation"],
            d["business_type"], d["business_years"], d["business_location"], d["residential_address"],
            d["latitude"], d["longitude"], d["location_accuracy_meters"], d["location_captured_at"],
            d["is_active"], d["deleted_at"], d["updated_at"],
            d["id"], tenantId,
          ],
        );
        return;
      }

      await db.run(
        `INSERT INTO clients (
          tenant_id,
          id, full_name, phone, national_id, branch_id, officer_id, created_by_user_id,
          kyc_status, onboarding_status, fee_payment_status, fees_paid_at,
          kra_pin, photo_url, id_document_url,
          next_of_kin_name, next_of_kin_phone, next_of_kin_relation,
          business_type, business_years, business_location, residential_address,
          latitude, longitude, location_accuracy_meters, location_captured_at,
          is_active, deleted_at, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          d["tenant_id"] || tenantId,
          d["id"], d["full_name"], d["phone"], d["national_id"], d["branch_id"],
          d["officer_id"], d["created_by_user_id"],
          d["kyc_status"], d["onboarding_status"], d["fee_payment_status"], d["fees_paid_at"],
          d["kra_pin"], d["photo_url"], d["id_document_url"],
          d["next_of_kin_name"], d["next_of_kin_phone"], d["next_of_kin_relation"],
          d["business_type"], d["business_years"], d["business_location"], d["residential_address"],
          d["latitude"], d["longitude"], d["location_accuracy_meters"], d["location_captured_at"],
          d["is_active"], d["deleted_at"], d["created_at"], d["updated_at"],
        ],
      );
    };

    if (this.deps.executeTransaction) {
      await this.deps.executeTransaction((tx) => persist(tx as { get: DbGet; run: DbRun }));
      return;
    }

    await persist(this.deps);
  }

  async findById(id: ClientId): Promise<Client | null> {
    const row = await this.deps.get(
      "SELECT * FROM clients WHERE id = ? AND tenant_id = ?",
      [id.value, getCurrentTenantId()],
    );
    return row ? this._rowToClient(row) : null;
  }

  async findByNationalId(nationalId: string): Promise<Client | null> {
    const normalized = nationalId.trim().toLowerCase();
    const row = await this.deps.get(
      "SELECT * FROM clients WHERE national_id IS NOT NULL AND LOWER(TRIM(national_id)) = ? AND tenant_id = ?",
      [normalized, getCurrentTenantId()],
    );
    return row ? this._rowToClient(row) : null;
  }

  async findByPhone(phone: string): Promise<Client | null> {
    const digits = phone.replace(/\D+/g, "");
    const row = await this.deps.get(
      "SELECT * FROM clients WHERE phone IS NOT NULL AND REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'+','') = ? AND tenant_id = ?",
      [digits, getCurrentTenantId()],
    );
    return row ? this._rowToClient(row) : null;
  }

  async exists(id: ClientId): Promise<boolean> {
    const row = await this.deps.get(
      "SELECT id FROM clients WHERE id = ? AND tenant_id = ?",
      [id.value, getCurrentTenantId()],
    );
    return Boolean(row);
  }

  async findByBranch(branchId: number, limit: number, offset: number): Promise<Client[]> {
    const rows = await this.deps.all(
      "SELECT * FROM clients WHERE branch_id = ? AND tenant_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT ? OFFSET ?",
      [branchId, getCurrentTenantId(), limit, offset],
    );
    return rows.map((r) => this._rowToClient(r));
  }

  async countByBranch(branchId: number): Promise<number> {
    const row = await this.deps.get(
      "SELECT COUNT(*) AS total FROM clients WHERE branch_id = ? AND tenant_id = ? AND deleted_at IS NULL",
      [branchId, getCurrentTenantId()],
    );
    return Number(row?.total || 0);
  }

  // ------------------------------------------------------------------
  // Row -> Domain mapping
  // ------------------------------------------------------------------

  private _rowToClient(row: Record<string, any>): Client {
    const safeDate = (v: unknown): Date | null => {
      if (!v) return null;
      const d = new Date(String(v));
      return isNaN(d.getTime()) ? null : d;
    };

    const props: ClientProps = {
      id:                   ClientId.fromNumber(Number(row["id"])),
      fullName:             String(row["full_name"] || ""),
      phone:                row["phone"] ? this._safePhone(String(row["phone"])) : null,
      nationalId:           row["national_id"] ? this._safeNationalId(String(row["national_id"])) : null,
      branchId:             Number(row["branch_id"] || 0),
      officerId:            row["officer_id"] != null ? Number(row["officer_id"]) : null,
      createdByUserId:      row["created_by_user_id"] != null ? Number(row["created_by_user_id"]) : null,
      kycStatus:            this._safeKycStatus(String(row["kyc_status"] || "pending")),
      onboardingStatus:     this._safeOnboardingStatus(String(row["onboarding_status"] || "registered")),
      feePaymentStatus:     this._safeFeePaymentStatus(String(row["fee_payment_status"] || "unpaid")),
      feesPaidAt:           safeDate(row["fees_paid_at"]),
      kraPin:               row["kra_pin"] ? String(row["kra_pin"]) : null,
      photoUrl:             row["photo_url"] ? String(row["photo_url"]) : null,
      idDocumentUrl:        row["id_document_url"] ? String(row["id_document_url"]) : null,
      nextOfKinName:        row["next_of_kin_name"] ? String(row["next_of_kin_name"]) : null,
      nextOfKinPhone:       row["next_of_kin_phone"] ? String(row["next_of_kin_phone"]) : null,
      nextOfKinRelation:    row["next_of_kin_relation"] ? String(row["next_of_kin_relation"]) : null,
      businessType:         row["business_type"] ? String(row["business_type"]) : null,
      businessYears:        row["business_years"] != null ? Number(row["business_years"]) : null,
      businessLocation:     row["business_location"] ? String(row["business_location"]) : null,
      residentialAddress:   row["residential_address"] ? String(row["residential_address"]) : null,
      latitude:             row["latitude"] != null ? Number(row["latitude"]) : null,
      longitude:            row["longitude"] != null ? Number(row["longitude"]) : null,
      locationAccuracyMeters: row["location_accuracy_meters"] != null ? Number(row["location_accuracy_meters"]) : null,
      locationCapturedAt:   safeDate(row["location_captured_at"]),
      isActive:             Number(row["is_active"] ?? 1) === 1,
      deletedAt:            safeDate(row["deleted_at"]),
      createdAt:            safeDate(row["created_at"]) ?? new Date(),
      updatedAt:            safeDate(row["updated_at"]),
    };

    return Client.reconstitute(props);
  }

  private _safePhone(v: string): PhoneNumber | null {
    try { return PhoneNumber.fromString(v); } catch { return null; }
  }

  private _safeNationalId(v: string): NationalId | null {
    try { return NationalId.fromString(v); } catch { return null; }
  }

  private _safeKycStatus(v: string): KycStatus {
    try { return KycStatus.fromString(v); } catch { return KycStatus.pending(); }
  }

  private _safeOnboardingStatus(v: string): OnboardingStatus {
    try { return OnboardingStatus.fromString(v); } catch { return OnboardingStatus.registered(); }
  }

  private _safeFeePaymentStatus(v: string): FeePaymentStatus {
    try { return FeePaymentStatus.fromString(v); } catch { return FeePaymentStatus.unpaid(); }
  }
}
