import crypto from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBooleanEnv } from "../utils/env.js";
import type { LoggerLike } from "../types/runtime.js";
import { resolveDefaultUploadDir } from "../utils/projectPaths.js";

const mimeExtensionMap: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "application/pdf": ".pdf",
};

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizePublicBasePath(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "/uploads";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return trimTrailingSlash(withLeadingSlash) || "/uploads";
}

function normalizeStorageDriver(value: unknown): "local" | "s3" {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "s3") {
    return "s3";
  }
  return "local";
}

function resolveFileExtension(originalName: string, mimeType: string): string {
  const mapped = mimeExtensionMap[String(mimeType || "").toLowerCase()];
  return mapped || ".bin";
}

function buildObjectKey(
  clientId: number,
  documentType: "photo" | "id_document" | "guarantor_id_document" | "collateral_document",
  originalName: string,
  mimeType: string,
): string {
  const extension = resolveFileExtension(originalName, mimeType);
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const randomPart = crypto.randomBytes(8).toString("hex");
  return `clients/${clientId}/${documentType}/${timestamp}-${randomPart}${extension}`;
}

function encodeObjectKey(objectKey: string): string {
  return objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function sha256Hex(value: Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmacSha256(key: Buffer | string, value: string): Buffer {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest();
}

function formatAwsDates(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString();
  const dateStamp = iso.slice(0, 10).replace(/-/g, "");
  const amzDate = `${dateStamp}T${iso.slice(11, 19).replace(/:/g, "")}Z`;
  return { amzDate, dateStamp };
}

function buildSignatureKey(secretAccessKey: string, dateStamp: string, region: string): Buffer {
  const dateKey = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmacSha256(dateKey, region);
  const serviceKey = hmacSha256(regionKey, "s3");
  return hmacSha256(serviceKey, "aws4_request");
}

function buildS3ObjectUrl(
  endpoint: string,
  bucket: string,
  objectKeyEncoded: string,
  forcePathStyle: boolean,
): { uploadUrl: URL; canonicalUri: string; hostHeader: string; defaultPublicUrl: string } {
  const endpointUrl = new URL(endpoint);
  const basePath = trimTrailingSlash(endpointUrl.pathname || "");
  const objectPath = forcePathStyle
    ? `${basePath}/${encodeURIComponent(bucket)}/${objectKeyEncoded}`
    : `${basePath}/${objectKeyEncoded}`;

  if (!forcePathStyle) {
    endpointUrl.hostname = `${bucket}.${endpointUrl.hostname}`;
  }
  endpointUrl.pathname = objectPath || "/";

  return {
    uploadUrl: endpointUrl,
    canonicalUri: endpointUrl.pathname || "/",
    hostHeader: endpointUrl.host,
    defaultPublicUrl: `${endpointUrl.origin}${endpointUrl.pathname}`,
  };
}

interface UploadToS3Params {
  uploadUrl: URL;
  canonicalUri: string;
  hostHeader: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bodyBuffer: Buffer;
  mimeType: string;
}

async function uploadToS3(params: UploadToS3Params): Promise<void> {
  const {
    uploadUrl,
    canonicalUri,
    hostHeader,
    region,
    accessKeyId,
    secretAccessKey,
    bodyBuffer,
    mimeType,
  } = params;

  const now = new Date();
  const { amzDate, dateStamp } = formatAwsDates(now);
  const payloadHash = sha256Hex(bodyBuffer);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;

  const signedHeaderEntries = [
    ["host", hostHeader],
    ["x-amz-content-sha256", payloadHash],
    ["x-amz-date", amzDate],
  ];

  const canonicalHeaders = signedHeaderEntries
    .map(([key, value]) => `${key}:${value}\n`)
    .join("");
  const signedHeaders = signedHeaderEntries.map(([key]) => key).join(";");
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(Buffer.from(canonicalRequest, "utf8")),
  ].join("\n");
  const signingKey = buildSignatureKey(secretAccessKey, dateStamp, region);
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  const response = await fetch(uploadUrl, {
    method: "PUT",
    body: new Uint8Array(bodyBuffer),
    headers: {
      Authorization: authorization,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      "Content-Type": mimeType,
    },
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `S3 upload failed (${response.status} ${response.statusText}): ${responseBody.slice(0, 500)}`,
    );
  }
}

type CreateDocumentStorageServiceOptions = {
  env?: NodeJS.ProcessEnv;
  logger?: LoggerLike | null;
};

interface StoreClientDocumentPayload {
  clientId: number;
  documentType: "photo" | "id_document" | "guarantor_id_document" | "collateral_document";
  fileBuffer: Buffer;
  mimeType: string;
  originalName: string;
}

interface StoredClientDocumentResult {
  url: string;
  objectKey: string;
  storageDriver: "local" | "s3";
}

function createDocumentStorageService(options: CreateDocumentStorageServiceOptions = {}) {
  const env = options.env || process.env;
  const logger = options.logger || null;
  const driver = normalizeStorageDriver(env.UPLOAD_STORAGE_DRIVER);
  const configuredMaxFileSizeMb = Number(env.UPLOAD_MAX_FILE_SIZE_MB);
  const maxFileSizeMb = Number.isFinite(configuredMaxFileSizeMb) && configuredMaxFileSizeMb > 0
    ? Math.floor(configuredMaxFileSizeMb)
    : 10;
  const maxFileSizeBytes = maxFileSizeMb * 1024 * 1024;

  const localDirectory = path.resolve(
    String(env.UPLOAD_LOCAL_DIR || resolveDefaultUploadDir(currentDir)).trim(),
  );
  const localPublicBasePath = normalizePublicBasePath(String(env.UPLOAD_PUBLIC_BASE_PATH || "/uploads"));
  if (driver === "local" && !fs.existsSync(localDirectory)) {
    fs.mkdirSync(localDirectory, { recursive: true });
  }

  const s3Endpoint = String(env.UPLOAD_S3_ENDPOINT || "").trim();
  const s3Bucket = String(env.UPLOAD_S3_BUCKET || "").trim();
  const s3Region = String(env.UPLOAD_S3_REGION || "us-east-1").trim() || "us-east-1";
  const s3AccessKeyId = String(env.UPLOAD_S3_ACCESS_KEY_ID || "").trim();
  const s3SecretAccessKey = String(env.UPLOAD_S3_SECRET_ACCESS_KEY || "").trim();
  const s3ForcePathStyle = parseBooleanEnv(env.UPLOAD_S3_FORCE_PATH_STYLE, true);
  const configuredS3PublicBaseUrl = String(env.UPLOAD_S3_PUBLIC_BASE_URL || "").trim();
  const configuredLocalPublicBaseUrl = String(env.UPLOAD_PUBLIC_BASE_URL || "").trim();
  const hasCompleteS3Configuration = Boolean(
    s3Endpoint && s3Bucket && s3AccessKeyId && s3SecretAccessKey,
  );

  if (driver === "s3" && logger && typeof logger.warn === "function") {
    if (hasCompleteS3Configuration) {
      logger.warn("uploads.s3_mode_enabled", {
        endpoint: s3Endpoint,
        bucket: s3Bucket,
        forcePathStyle: s3ForcePathStyle,
      });
    } else {
      logger.warn("uploads.s3_mode_misconfigured", {
        message: "Missing one or more required S3 upload settings",
      });
    }
  }

  return {
    driver,
    maxFileSizeBytes,
    localPublicBasePath,
    localDirectory,

    async storeClientDocument(payload: StoreClientDocumentPayload): Promise<StoredClientDocumentResult> {
      const objectKey = buildObjectKey(
        payload.clientId,
        payload.documentType,
        payload.originalName,
        payload.mimeType,
      );
      const objectKeyEncoded = encodeObjectKey(objectKey);

      if (driver === "local") {
        const targetPath = path.join(localDirectory, ...objectKey.split("/"));
        await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });
        await fsPromises.writeFile(targetPath, payload.fileBuffer);

        const url = configuredLocalPublicBaseUrl
          ? `${trimTrailingSlash(configuredLocalPublicBaseUrl)}/${objectKeyEncoded}`
          : `${localPublicBasePath}/${objectKeyEncoded}`;

        return {
          url,
          objectKey,
          storageDriver: "local",
        };
      }

      if (!hasCompleteS3Configuration) {
        throw new Error(
          "S3 storage mode requires UPLOAD_S3_ENDPOINT, UPLOAD_S3_BUCKET, UPLOAD_S3_ACCESS_KEY_ID, and UPLOAD_S3_SECRET_ACCESS_KEY",
        );
      }

      const { uploadUrl, canonicalUri, hostHeader, defaultPublicUrl } = buildS3ObjectUrl(
        s3Endpoint,
        s3Bucket,
        objectKeyEncoded,
        s3ForcePathStyle,
      );

      await uploadToS3({
        uploadUrl,
        canonicalUri,
        hostHeader,
        region: s3Region,
        accessKeyId: s3AccessKeyId,
        secretAccessKey: s3SecretAccessKey,
        bodyBuffer: payload.fileBuffer,
        mimeType: payload.mimeType,
      });

      return {
        url: configuredS3PublicBaseUrl
          ? `${trimTrailingSlash(configuredS3PublicBaseUrl)}/${objectKeyEncoded}`
          : defaultPublicUrl,
        objectKey,
        storageDriver: "s3",
      };
    },
  };
}

export {
  createDocumentStorageService,
};
