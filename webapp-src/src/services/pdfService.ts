function normalizeCell(value: unknown): string {
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

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n\t]+/g, " ");
}

interface CreateSimplePdfDocumentOptions {
  title: string;
  headers: string[];
  rows: Array<Record<string, unknown>>;
  generatedAtIso?: string;
}

function createSimplePdfDocument({ title, headers, rows, generatedAtIso }: CreateSimplePdfDocumentOptions): Buffer {
  const generatedAt = String(generatedAtIso || new Date().toISOString());
  const limitedRows = rows.slice(0, 250);
  const lines = [
    truncate(title, 120),
    `Generated: ${generatedAt}`,
    "",
  ];

  if (headers.length === 0) {
    lines.push("No tabular data columns were provided.");
  } else {
    const headerLine = headers.map((column) => truncate(String(column), 30)).join(" | ");
    lines.push(headerLine);
    lines.push("-".repeat(Math.min(headerLine.length, 140)));
    for (const row of limitedRows) {
      const line = headers
        .map((column) => truncate(normalizeCell(row[column]), 30))
        .join(" | ");
      lines.push(line);
    }
  }

  if (rows.length > limitedRows.length) {
    lines.push("");
    lines.push(`... ${rows.length - limitedRows.length} additional rows omitted`);
  }

  const usableLines = lines.slice(0, 58);
  const commands = ["BT", "/F1 9 Tf", "42 802 Td"];
  usableLines.forEach((line, index) => {
    if (index > 0) {
      commands.push("0 -13 Td");
    }
    commands.push(`(${escapePdfText(line)}) Tj`);
  });
  commands.push("ET");
  const stream = commands.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
  ];

  const parts = [Buffer.from("%PDF-1.4\n", "utf8")];
  const offsets = [0];

  for (let index = 0; index < objects.length; index += 1) {
    const objectIndex = index + 1;
    const nextOffset = parts.reduce((sum, part) => sum + part.length, 0);
    offsets.push(nextOffset);
    const objectBody = `${objectIndex} 0 obj\n${objects[index]}\nendobj\n`;
    parts.push(Buffer.from(objectBody, "utf8"));
  }

  const xrefOffset = parts.reduce((sum, part) => sum + part.length, 0);
  const xrefHeader = [`xref`, `0 ${objects.length + 1}`, "0000000000 65535 f "];
  for (let index = 1; index <= objects.length; index += 1) {
    xrefHeader.push(`${String(offsets[index]).padStart(10, "0")} 00000 n `);
  }
  parts.push(Buffer.from(`${xrefHeader.join("\n")}\n`, "utf8"));
  parts.push(Buffer.from(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
    "utf8",
  ));

  return Buffer.concat(parts);
}

export {
  createSimplePdfDocument,
};
