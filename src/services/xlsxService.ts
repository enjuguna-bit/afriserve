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

function sanitizeXmlText(value: string): string {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x09 || code === 0x0a || code === 0x0d || code >= 0x20) {
      output += value[index];
    }
  }
  return output;
}

function escapeXml(value: string): string {
  return sanitizeXmlText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toColumnLetters(indexZeroBased: number): string {
  let index = indexZeroBased;
  let letters = "";
  while (index >= 0) {
    letters = String.fromCharCode((index % 26) + 65) + letters;
    index = Math.floor(index / 26) - 1;
  }
  return letters;
}

function isFiniteNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

interface BuildCellXmlOptions {
  rowIndex: number;
  colIndex: number;
  value: unknown;
  isHeader?: boolean;
}

function buildCellXml({ rowIndex, colIndex, value, isHeader = false }: BuildCellXmlOptions): string {
  const cellRef = `${toColumnLetters(colIndex)}${rowIndex}`;
  if (!isHeader && isFiniteNumber(value)) {
    return `<c r="${cellRef}"><v>${value}</v></c>`;
  }
  const text = escapeXml(normalizeCell(value));
  const styleAttribute = isHeader ? ' s="1"' : "";
  return `<c r="${cellRef}" t="inlineStr"${styleAttribute}><is><t>${text}</t></is></c>`;
}

function buildSheetXml(headers: string[], rows: Array<Record<string, unknown>>): string {
  const allRows = [];
  const headerCells = headers.map((header, index) => buildCellXml({
    rowIndex: 1,
    colIndex: index,
    value: header,
    isHeader: true,
  })).join("");
  allRows.push(`<row r="1">${headerCells}</row>`);

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]!;
    const rowNumber = rowIndex + 2;
    const cells = headers.map((header, colIndex) => buildCellXml({
      rowIndex: rowNumber,
      colIndex,
      value: row[header],
    })).join("");
    allRows.push(`<row r="${rowNumber}">${cells}</row>`);
  }

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    "<sheetData>",
    ...allRows,
    "</sheetData>",
    "</worksheet>",
  ].join("");
}

const contentTypesXml = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
  '<Default Extension="xml" ContentType="application/xml"/>',
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
  "</Types>",
].join("");

const rootRelsXml = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
  "</Relationships>",
].join("");

function buildWorkbookXml(sheetName: string): string {
  const safeName = sheetName
    .replace(/[\\/*?:[\]]/g, "")
    .trim()
    .slice(0, 31) || "Report";
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    "<sheets>",
    `<sheet name="${escapeXml(safeName)}" sheetId="1" r:id="rId1"/>`,
    "</sheets>",
    "</workbook>",
  ].join("");
}

const workbookRelsXml = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
  "</Relationships>",
].join("");

const stylesXml = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
  '<fonts count="2">',
  '<font><sz val="11"/><name val="Calibri"/></font>',
  '<font><b/><sz val="11"/><name val="Calibri"/></font>',
  "</fonts>",
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>',
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>',
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
  '<cellXfs count="2">',
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
  "</cellXfs>",
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
  "</styleSheet>",
].join("");

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let current = i;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((current & 1) !== 0) {
        current = 0xedb88320 ^ (current >>> 1);
      } else {
        current >>>= 1;
      }
    }
    table[i] = current >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    const byte = buffer[index];
    crc = crc32Table[(crc ^ byte!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

function createStoredZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const dataBuffer = entry.data;
    const checksum = crc32(dataBuffer);

    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(dataBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuffer.copy(localHeader, 30);
    localParts.push(localHeader, dataBuffer);

    const centralHeader = Buffer.alloc(46 + nameBuffer.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(dataBuffer.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuffer.copy(centralHeader, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + dataBuffer.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const centralStart = offset;
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(centralStart, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

interface CreateSimpleXlsxWorkbookOptions {
  headers: string[];
  rows: Array<Record<string, unknown>>;
  title?: string;
}

function createSimpleXlsxWorkbook({ headers, rows, title = "Report" }: CreateSimpleXlsxWorkbookOptions): Buffer {
  const entries = [
    { name: "[Content_Types].xml", data: Buffer.from(contentTypesXml, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rootRelsXml, "utf8") },
    { name: "xl/workbook.xml", data: Buffer.from(buildWorkbookXml(title), "utf8") },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(workbookRelsXml, "utf8") },
    { name: "xl/styles.xml", data: Buffer.from(stylesXml, "utf8") },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.from(buildSheetXml(headers, rows), "utf8") },
  ];
  return createStoredZip(entries);
}

export {
  createSimpleXlsxWorkbook,
};
