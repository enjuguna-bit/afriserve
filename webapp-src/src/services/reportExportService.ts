import { createSimplePdfDocument } from "./pdfService.js";
import { createSimpleXlsxWorkbook } from "./xlsxService.js";

function toCellString(value: unknown): string {
  if (value === null || typeof value === "undefined") {
    return "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

function csvRow(values: unknown[], quoteAllFields = false): string {
  return values
    .map((value) => {
      const normalized = toCellString(value);
      if (quoteAllFields || normalized.includes(",") || normalized.includes('"') || normalized.includes("\n")) {
        return `"${normalized.replace(/"/g, '""')}"`;
      }
      return normalized;
    })
    .join(",");
}

function buildCsv(
  headers: string[],
  rows: Array<Record<string, unknown>>,
  quoteAllFields = false,
): string {
  const lines = [
    csvRow(headers, quoteAllFields),
    ...rows.map((row) => csvRow(headers.map((header) => row[header]), quoteAllFields)),
  ];
  return lines.join("\n");
}

function isTabularObject(value: unknown): boolean {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

interface BuildTabularExportOptions {
  format: string;
  filenameBase: string;
  title: string;
  headers: string[];
  rows: Array<Record<string, unknown>>;
  csvQuoteAllFields?: boolean;
}

interface TabularExportResult {
  handled: boolean;
  contentType?: string;
  filename?: string;
  body?: string | Buffer;
}

function buildTabularExport({
  format,
  filenameBase,
  title,
  headers,
  rows,
  csvQuoteAllFields = false,
}: BuildTabularExportOptions): TabularExportResult {
  const normalizedFormat = String(format || "").trim().toLowerCase();
  if (normalizedFormat === "json" || !normalizedFormat) {
    return { handled: false };
  }

  const normalizedRows = Array.isArray(rows)
    ? rows.filter((row) => isTabularObject(row))
    : [];
  const normalizedHeaders = Array.isArray(headers) ? headers.map((header) => String(header)) : [];

  if (normalizedFormat === "csv") {
    return {
      handled: true,
      contentType: "text/csv; charset=utf-8",
      filename: `${filenameBase}.csv`,
      body: buildCsv(normalizedHeaders, normalizedRows, csvQuoteAllFields),
    };
  }

  if (normalizedFormat === "pdf") {
    return {
      handled: true,
      contentType: "application/pdf",
      filename: `${filenameBase}.pdf`,
      body: createSimplePdfDocument({
        title,
        headers: normalizedHeaders,
        rows: normalizedRows,
      }),
    };
  }

  if (normalizedFormat === "xlsx") {
    return {
      handled: true,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: `${filenameBase}.xlsx`,
      body: createSimpleXlsxWorkbook({
        headers: normalizedHeaders,
        rows: normalizedRows,
      }),
    };
  }

  return { handled: false };
}

export {
  buildTabularExport,
};
