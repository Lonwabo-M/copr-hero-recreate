// ─── CSV ─────────────────────────────────────────────────────────────────────
// Minimal, dependency-free CSV encode/decode used by the Operations Centre
// order import/export. Deliberately conservative: RFC 4180 quoting on the way
// out, tolerant parsing on the way in (quoted fields, embedded commas/newlines,
// CRLF or LF line endings, UTF-8 BOM, blank trailing lines).

export interface CsvColumn {
  /** Field key in the source object. */
  key: string;
  /** Header text written/expected in the file. */
  label: string;
}

export interface ParsedCsv {
  headers: string[];
  /** One record per data row, keyed by header. */
  rows: Array<Record<string, string>>;
}

/** Escape + join a cell. Numbers/booleans are stringified; null/undefined → "". */
function encodeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Serialise records to CSV text with a UTF-8 BOM so Excel opens it correctly.
 */
export function toCsv(
  records: Array<Record<string, unknown>>,
  columns: CsvColumn[],
): string {
  const header = columns.map((c) => encodeCell(c.label)).join(",");
  const body = records.map((record) =>
    columns.map((c) => encodeCell(record[c.key])).join(","),
  );
  return `\uFEFF${[header, ...body].join("\r\n")}\r\n`;
}

/** Trigger a client-side file download of CSV text. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parse CSV text into header-keyed records.
 *
 * Handles quoted fields (including escaped "" and embedded newlines), trailing
 * empty lines, and a leading BOM. Header matching for consumers is case- and
 * space-insensitive via `pickField`.
 */
export function parseCsv(text: string): ParsedCsv {
  const input = text.replace(/^\uFEFF/, "");

  const rows: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      record.push(field);
      rows.push(record);
      record = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || record.length > 0) {
    record.push(field);
    rows.push(record);
  }

  const cleaned = rows.filter(
    (r) => r.some((cell) => cell.trim().length > 0),
  );
  if (cleaned.length === 0) return { headers: [], rows: [] };

  const headers = cleaned[0].map((h) => h.trim());
  const dataRows = cleaned.slice(1).map((cells) => {
    const recordObj: Record<string, string> = {};
    headers.forEach((header, index) => {
      recordObj[header] = (cells[index] ?? "").trim();
    });
    return recordObj;
  });

  return { headers, rows: dataRows };
}

/**
 * Case/space/punctuation-insensitive field lookup, so a hand-made spreadsheet
 * with "Pickup Address" or "pickup_address" still maps to the same column.
 */
export function pickField(
  row: Record<string, string>,
  ...candidates: string[]
): string | undefined {
  const normalise = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalisedCandidates = candidates.map(normalise);
  for (const [key, value] of Object.entries(row)) {
    if (normalisedCandidates.includes(normalise(key))) {
      const trimmed = value?.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}
