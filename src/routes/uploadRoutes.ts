import multer from "multer";
import { getCurrentTenantId } from "../utils/tenantStore.js";
import type { NextFunction, Request, Response } from "express";
import type { RouteRegistrar, UploadRouteDeps } from "../types/routeDeps.js";

type UploadRequest = Request & {
  user: Record<string, any>;
  file?: Express.Multer.File;
  body: {
    clientId?: unknown;
    documentType?: unknown;
  };
};

function buildAbsoluteUrl(req: Request, maybeRelativeUrl: string): string {
  if (/^https?:\/\//i.test(maybeRelativeUrl)) {
    return maybeRelativeUrl;
  }

  const configuredBase = String(process.env.UPLOAD_PUBLIC_BASE_URL || process.env.API_BASE_URL || "").trim();
  if (configuredBase) {
    const normalizedPath = maybeRelativeUrl.startsWith("/") ? maybeRelativeUrl : `/${maybeRelativeUrl}`;
    return `${configuredBase.replace(/\/+$/, "")}${normalizedPath}`;
  }

  const protocol = String(req.protocol || "http");
  const host = String(req.get?.("host") || "").trim();
  if (!host) {
    return maybeRelativeUrl;
  }

  const normalizedPath = maybeRelativeUrl.startsWith("/") ? maybeRelativeUrl : `/${maybeRelativeUrl}`;
  return `${protocol}://${host}${normalizedPath}`;
}

function parseClientId(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseDocumentType(
  value: unknown,
): "photo" | "id_document" | "guarantor_id_document" | "collateral_document" | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "photo"
    || normalized === "id_document"
    || normalized === "guarantor_id_document"
    || normalized === "collateral_document"
  ) {
    return normalized;
  }
  return null;
}

function isAllowedMimeTypeForDocument(
  documentType: "photo" | "id_document" | "guarantor_id_document" | "collateral_document",
  mimeType: string,
): boolean {
  const normalizedMimeType = String(mimeType || "").toLowerCase();
  if (documentType === "photo") {
    return normalizedMimeType.startsWith("image/");
  }

  if (normalizedMimeType === "application/pdf") {
    return true;
  }
  return normalizedMimeType.startsWith("image/");
}

function registerUploadRoutes(app: RouteRegistrar, deps: UploadRouteDeps) {
  const {
    get,
    run,
    authenticate,
    authorize,
    writeAuditLog,
    hierarchyService,
    documentStorage,
    reportCache = null,
  } = deps;

  const uploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: {
      files: 1,
      fileSize: documentStorage.maxFileSizeBytes,
    },
  }).single("file");

  async function invalidateReportCaches() {
    if (!reportCache || !reportCache.enabled) {
      return;
    }

    try {
      await reportCache.invalidatePrefix?.("reports:");
    } catch (_error) {
      // Best-effort cache invalidation should not fail request writes.
    }
  }

  app.post(
    "/api/uploads/client-document",
    authenticate,
    authorize("admin", "operations_manager", "loan_officer"),
    (req: Request, res: Response, next: NextFunction) => {
      uploadMiddleware(req, res, async (uploadError: unknown) => {
        const typedReq = req as UploadRequest;

        if (uploadError) {
          if (uploadError instanceof multer.MulterError) {
            if (uploadError.code === "LIMIT_FILE_SIZE") {
              res.status(413).json({ message: "Uploaded file exceeds size limit" });
              return;
            }

            res.status(400).json({ message: uploadError.message || "Invalid multipart payload" });
            return;
          }
          next(uploadError);
          return;
        }

        try {
          const clientId = parseClientId(typedReq.body?.clientId);
          if (!clientId) {
            res.status(400).json({ message: "clientId is required and must be a positive integer" });
            return;
          }

          const documentType = parseDocumentType(typedReq.body?.documentType);
          if (!documentType) {
            res.status(400).json({
              message: "documentType must be one of: photo, id_document, guarantor_id_document, collateral_document",
            });
            return;
          }

          if (!typedReq.file || !Buffer.isBuffer(typedReq.file.buffer)) {
            res.status(400).json({ message: "file is required" });
            return;
          }

          if (!isAllowedMimeTypeForDocument(documentType, typedReq.file.mimetype)) {
            res.status(400).json({
              message: documentType === "photo"
                ? "photo uploads must be image files"
                : "document uploads must be image or PDF files",
            });
            return;
          }

          const scope = await hierarchyService.resolveHierarchyScope(typedReq.user);
          const client = await get("SELECT id, branch_id FROM clients WHERE id = ? AND tenant_id = ?", [clientId, getCurrentTenantId()]);
          if (!client) {
            res.status(404).json({ message: "Client not found" });
            return;
          }
          if (!hierarchyService.isBranchInScope(scope, client.branch_id)) {
            res.status(403).json({ message: "Forbidden: client is outside your scope" });
            return;
          }

          const uploadedDocument = await documentStorage.storeClientDocument({
            clientId,
            documentType,
            fileBuffer: typedReq.file.buffer,
            mimeType: typedReq.file.mimetype,
            originalName: typedReq.file.originalname,
          });
          const resolvedDocumentUrl = buildAbsoluteUrl(typedReq, uploadedDocument.url);
          const targetColumn = documentType === "photo"
            ? "photo_url"
            : documentType === "id_document"
              ? "id_document_url"
              : null;

          if (targetColumn) {
            const updatedAt = new Date().toISOString();
            await run(
              `
                UPDATE clients
                SET ${targetColumn} = ?, updated_at = ?
                WHERE id = ? AND tenant_id = ?
              `,
              [resolvedDocumentUrl, updatedAt, clientId, getCurrentTenantId()],
            );
          }

          const updatedClient = targetColumn
            ? await get("SELECT * FROM clients WHERE id = ? AND tenant_id = ?", [clientId, getCurrentTenantId()])
            : null;
          await writeAuditLog({
            userId: typedReq.user.sub,
            action: "client.document_uploaded",
            targetType: "client",
            targetId: clientId,
            details: JSON.stringify({
              documentType,
              mimeType: typedReq.file.mimetype,
              originalName: typedReq.file.originalname,
              storageDriver: uploadedDocument.storageDriver,
              objectKey: uploadedDocument.objectKey,
            }),
            ipAddress: typedReq.ip,
          });
          await invalidateReportCaches();

          res.status(201).json({
            message: "Client document uploaded",
            clientId,
            documentType,
            url: resolvedDocumentUrl,
            client: updatedClient,
          });
        } catch (error: unknown) {
          next(error);
        }
      });
    },
  );
}

export {
  registerUploadRoutes,
};
