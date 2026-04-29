import bcrypt from "bcryptjs";
import { HQ_SEED, KENYA_REGIONS, KENYA_BRANCH_SEED } from "../config/kenyaHierarchy.js";
import { INITIAL_PRODUCT_GUIDE_CONFIG, INITIAL_PRODUCT_GUIDE_NAME } from "../services/loanProductPricing.js";
import { parseBooleanEnv } from "../utils/env.js";
import { getConfiguredDbClient } from "../utils/env.js";

const DEFAULT_ADMIN_FULL_NAME = "System Administrator";
const DEFAULT_ADMIN_EMAIL = "admin@afriserve.local";
const DEFAULT_ADMIN_PASSWORD = "Admin@123";
const SQLITE_NOW_ISO = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const DB_NOW_EXPRESSION =
  getConfiguredDbClient() === "postgres" ? "CURRENT_TIMESTAMP" : SQLITE_NOW_ISO;
type SeedDeps = {
  run: (sql: string, params?: unknown[]) => Promise<any>;
  get: (sql: string, params?: unknown[]) => Promise<any>;
  all: (sql: string, params?: unknown[]) => Promise<any[]>;
};

function shouldSeedDefaultAdmin(env: NodeJS.ProcessEnv = process.env): boolean {
  const explicitToggle = String(env.SEED_DEFAULT_ADMIN_ON_EMPTY_DB || "").trim();
  if (explicitToggle) {
    return parseBooleanEnv(explicitToggle, false);
  }

  return String(env.NODE_ENV || "").trim().toLowerCase() !== "production";
}

function resolveDefaultAdminSeedConfig(env: NodeJS.ProcessEnv = process.env): {
  fullName: string;
  email: string;
  password: string;
} | null {
  if (!shouldSeedDefaultAdmin(env)) {
    return null;
  }

  const isProduction = String(env.NODE_ENV || "").trim().toLowerCase() === "production";
  const fullName = String(env.DEFAULT_ADMIN_FULL_NAME || DEFAULT_ADMIN_FULL_NAME).trim() || DEFAULT_ADMIN_FULL_NAME;
  const email = String(env.DEFAULT_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase() || DEFAULT_ADMIN_EMAIL;
  const password = String(
    env.DEFAULT_ADMIN_PASSWORD || (isProduction ? "" : DEFAULT_ADMIN_PASSWORD),
  ).trim();

  if (isProduction && !password) {
    throw new Error(
      "DEFAULT_ADMIN_PASSWORD is required when SEED_DEFAULT_ADMIN_ON_EMPTY_DB=true in production.",
    );
  }

  return {
    fullName,
    email,
    password,
  };
}

function createSeedApi(deps: SeedDeps) {
  const { run, get, all } = deps;

  async function seedHierarchyData() {
    const existingHq = await get("SELECT id FROM headquarters WHERE code = ?", [HQ_SEED.code]);
    let hqId = existingHq?.id || null;
    if (!hqId) {
      const hqInsert = await run(
        `
          INSERT INTO headquarters (name, code, location, contact_phone, contact_email, created_at)
          VALUES (?, ?, ?, ?, ?, ${DB_NOW_EXPRESSION})
        `,
        [HQ_SEED.name, HQ_SEED.code, HQ_SEED.location, HQ_SEED.contactPhone, HQ_SEED.contactEmail],
      );
      hqId = hqInsert.lastID;
    }

    for (const region of KENYA_REGIONS) {
      await run(
        `
          INSERT INTO regions (hq_id, name, code, is_active, created_at)
          VALUES (?, ?, ?, 1, ${DB_NOW_EXPRESSION})
          ON CONFLICT(code) DO UPDATE SET
            name = excluded.name,
            hq_id = excluded.hq_id
        `,
        [hqId, region.name, region.code],
      );
    }

    const regionRows = await all("SELECT id, code FROM regions") as Array<{ id: number; code: string }>;
    const regionByCode = new Map(regionRows.map((row) => [row.code, row.id]));

    for (const branch of KENYA_BRANCH_SEED) {
      const regionId = regionByCode.get(branch.regionCode);
      if (!regionId) {
        continue;
      }

      await run(
        `
          INSERT INTO branches (
            name,
            code,
            location_address,
            county,
            town,
            contact_phone,
            contact_email,
            region_id,
            is_active,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ${DB_NOW_EXPRESSION}, ${DB_NOW_EXPRESSION})
          ON CONFLICT(code) DO NOTHING
        `,
        [
          branch.name,
          branch.code,
          branch.locationAddress,
          branch.county,
          branch.town,
          branch.contactPhone,
          branch.contactEmail,
          regionId,
        ],
      );
    }
  }

  async function seedDefaultAdmin() {
    const seedConfig = resolveDefaultAdminSeedConfig();
    if (!seedConfig) {
      return;
    }

    const userCount = await get("SELECT COUNT(*) AS total_users FROM users");
    if (!userCount || Number(userCount.total_users || 0) === 0) {
      const defaultPasswordHash = await bcrypt.hash(seedConfig.password, 10);
      const defaultBranch = await get(
        "SELECT id FROM branches WHERE is_active = 1 ORDER BY id ASC LIMIT 1",
      );
      await run(
        `
          INSERT INTO users (full_name, email, password_hash, role, branch_id, created_at)
          VALUES (?, ?, ?, 'admin', ?, ${DB_NOW_EXPRESSION})
        `,
        [seedConfig.fullName, seedConfig.email, defaultPasswordHash, defaultBranch?.id || null],
      );
    }
  }

  async function seedDefaultLoanProduct() {
    const existingActiveProduct = await get(
      "SELECT id FROM loan_products WHERE is_active = 1 ORDER BY id ASC LIMIT 1",
    );
    if (!existingActiveProduct?.id) {
      await run(
        `
          INSERT INTO loan_products (
            name,
            interest_rate,
            registration_fee,
            processing_fee,
            penalty_rate_daily,
            penalty_flat_amount,
            penalty_grace_days,
            penalty_cap_amount,
            min_principal,
            max_principal,
            min_term_weeks,
            max_term_weeks,
            is_active,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ${DB_NOW_EXPRESSION}, ${DB_NOW_EXPRESSION})
        `,
        [
          "Standard Working Capital",
          20,
          200,
          500,
          0,
          0,
          0,
          null,
          1,
          1000000,
          1,
          260,
        ],
      );
    }

    const existingGuideProduct = await get(
      "SELECT id FROM loan_products WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1",
      [INITIAL_PRODUCT_GUIDE_NAME],
    );
    if (!existingGuideProduct) {
      await run(
        `
          INSERT INTO loan_products (
            name,
            interest_rate,
            registration_fee,
            processing_fee,
            penalty_rate_daily,
            penalty_flat_amount,
            penalty_grace_days,
            penalty_cap_amount,
            pricing_strategy,
            pricing_config,
            min_principal,
            max_principal,
            min_term_weeks,
            max_term_weeks,
            is_active,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ${DB_NOW_EXPRESSION}, ${DB_NOW_EXPRESSION})
        `,
        [
          INITIAL_PRODUCT_GUIDE_NAME,
          0,
          INITIAL_PRODUCT_GUIDE_CONFIG.registrationFee,
          INITIAL_PRODUCT_GUIDE_CONFIG.processingFee,
          0,
          0,
          0,
          null,
          "graduated_weekly_income",
          JSON.stringify(INITIAL_PRODUCT_GUIDE_CONFIG),
          Number(INITIAL_PRODUCT_GUIDE_CONFIG.principalMin || 1),
          Number(INITIAL_PRODUCT_GUIDE_CONFIG.principalMax || 1000000),
          Math.min(...INITIAL_PRODUCT_GUIDE_CONFIG.supportedTerms),
          Math.max(...INITIAL_PRODUCT_GUIDE_CONFIG.supportedTerms),
        ],
      );
    }
  }

  // Seed a loan officer user assigned to Nakuru branch
  async function seedOfficerUser() {
    const officerEmail = "joel@gmail.com";
    const officerFullName = "Joel Officer";
    const officerPassword = "100+Twenty!";
    const officerRole = "loan_officer";
    // Find Nakuru branch id
    const nakuruBranch = await get("SELECT id FROM branches WHERE code = ?", ["NAKURU-MAIN"]);
    if (!nakuruBranch?.id) {
      throw new Error("Nakuru branch not found. Please ensure it is seeded first.");
    }
    // Check if user already exists
    const existingOfficer = await get("SELECT id FROM users WHERE LOWER(email) = ?", [officerEmail.toLowerCase()]);
    if (existingOfficer?.id) {
      return; // Already seeded
    }
    const passwordHash = await bcrypt.hash(officerPassword, 10);
    await run(
      `
        INSERT INTO users (full_name, email, password_hash, role, branch_id, created_at)
        VALUES (?, ?, ?, ?, ?, ${DB_NOW_EXPRESSION})
      `,
      [officerFullName, officerEmail, passwordHash, officerRole, nakuruBranch.id]
    );
  }

  return {
    seedHierarchyData,
    seedDefaultAdmin,
    seedDefaultLoanProduct,
    seedOfficerUser,
  };
}

export {
  createSeedApi,
};
