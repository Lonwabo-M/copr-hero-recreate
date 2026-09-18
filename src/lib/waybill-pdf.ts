import { jsPDF } from "jspdf";
import logoMark from "@/assets/22-mark.png";

// ─── Waybill PDF ─────────────────────────────────────────────────────────────
// Renders the server-resolved waybill payload (see
// deliveries.waybills.getWaybillForOps) into a professional A4 consignment
// note and triggers the browser download. No backend PDF service — the payload
// is authoritative, the browser just renders it.
//
// Layout grammar (standard freight waybill anatomy):
//   1. Brand header band (real Lasha mark) + document class
//   2. Reference strip — waybill no., tracking no., status, issue date
//   3. SHIP FROM / SHIP TO panels
//   4. Consignment details table (goods, class, dimensions, weight)
//   5. Service & charges row
//   6. Handling record (requested → completed)
//   7. Signature blocks (driver + recipient)
//   8. Footer band with carriage terms

export interface WaybillPayload {
  waybillNumber: string;
  trackingNumber: string;
  status: string;
  createdAt: number;
  pickup: {
    label: string;
    street: string | null;
    city: string | null;
    zip: string | null;
    lat: number | null;
    lng: number | null;
  };
  dropoff: {
    label: string;
    street: string | null;
    city: string | null;
    zip: string | null;
    lat: number | null;
    lng: number | null;
  };
  sender: { name: string; phone: string | null; email: string | null } | null;
  /** The account's business name (B2B consignor). Null for B2C individuals. */
  businessName: string | null;
  recipient: { name: string | null; phone: string | null };
  courier: { name: string; phone: string | null } | null;
  parcel: {
    description: string | null;
    packageSize: string | null;
    parcelType: string | null;
    expeditionType: string | null;
    width: number | null;
    height: number | null;
    weight: number | null;
  };
  price: number | null;
  scheduledTime: number | null;
  startedAt: number | null;
  completedAt: number | null;
}

// Palette — matches the Lasha design system.
const NAVY: [number, number, number] = [16, 34, 51];
const CYAN: [number, number, number] = [7, 148, 181];
const INK: [number, number, number] = [31, 41, 51];
const MUTED: [number, number, number] = [110, 122, 134];
const RULE: [number, number, number] = [208, 218, 226];
const PANEL_BG: [number, number, number] = [246, 249, 251];

// Page geometry — A4 portrait, mm.
const W = 210;
const H = 297;
const M = 14; // outer margin
const CONTENT_W = W - M * 2;

function fmtDateTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtAddress(a: WaybillPayload["pickup"]): string[] {
  const line1 = a.street ?? null;
  const line2 = [a.city, a.zip].filter((p): p is string => !!p && p.length > 0).join(", ");
  if (!line1 && !line2) return ["Address on file"];
  const lines: string[] = [];
  if (line1) lines.push(line1);
  if (line2) lines.push(line2);
  return lines;
}

function fmtZar(cents: number | null): string {
  if (cents === null || cents === undefined) return "—";
  return `R ${(cents / 100).toFixed(2)}`;
}

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Section label — small caps-style kicker above a block. */
function sectionLabel(doc: jsPDF, text: string, x: number, y: number): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(text.toUpperCase(), x, y);
  doc.setFont("helvetica", "normal");
}

/** Field value — secondary data text. */
function mutedValue(doc: jsPDF, text: string, x: number, y: number, size = 9.5): void {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  doc.setTextColor(...MUTED);
  doc.text(text, x, y);
}

export function downloadWaybillPdf(p: WaybillPayload): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // ── 1. Brand header band ───────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 26, "F");
  // Cyan brand accent under the band.
  doc.setFillColor(...CYAN);
  doc.rect(0, 26, W, 1.2, "F");

  // Real Lasha mark (22-mark.png — the colored mark alone, transparent
  // background) placed edge-to-edge on the navy band. No white chip behind it
  // and no separate "Lasha" word beside it — the mark IS the brand line.
  const markH = 12; // mm
  const markW = markH * (152 / 117); // measured asset aspect (w/h)
  doc.addImage(logoMark, "PNG", M, (26 - markH) / 2, markW, markH);

  // Right-aligned document class.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("LASHA LOGISTICS (PTY) LTD", W - M, 10.5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(190, 210, 220);
  doc.text("Waybill / Consignment Note", W - M, 15.3, { align: "right" });
  doc.text("Non-negotiable document of carriage", W - M, 19.5, { align: "right" });

  // ── 2. Reference strip ─────────────────────────────────────────────────────
  let y = 34;
  const refH = 16;
  doc.setFillColor(...PANEL_BG);
  doc.roundedRect(M, y, CONTENT_W, refH, 1.5, 1.5, "F");
  doc.setDrawColor(...RULE);
  doc.roundedRect(M, y, CONTENT_W, refH, 1.5, 1.5, "S");

  // Columns are SIZED TO THEIR CONTENT, not quartered: waybill/tracking
  // numbers are long fixed-width strings and equal columns overflowed into
  // the next column (the reported "WAYBILL NO. over TRACKING NO." overlap).
  // The two reference numbers get exactly the width their text needs; Status
  // and Issue Date share the remainder. If nothing fits at 11.5pt the whole
  // row downshifts a notch at a time.
  const refPad = 5; // left pad inside a column
  const refGap = 4; // breathing room after a value before its divider
  const measureRef = (text: string, size: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    const wmm = doc.getTextWidth(text);
    doc.setFont("helvetica", "normal");
    return wmm;
  };

  const refValues = [
    p.waybillNumber,
    p.trackingNumber,
    titleCase(p.status),
    fmtDateTime(p.createdAt).split(",")[0],
  ];
  let refSize = 11.5;
  for (; refSize >= 8; refSize -= 0.5) {
    const needed =
      refValues.reduce((sum, v) => sum + measureRef(v, refSize), 0) +
      refPad * 2 * 4 +
      refGap * 3;
    if (needed <= CONTENT_W) break;
  }
  const wbW = measureRef(refValues[0], refSize) + refPad * 2 + refGap;
  const trW = measureRef(refValues[1], refSize) + refPad * 2 + refGap;
  const remainingW = CONTENT_W - wbW - trW;
  const colBounds = [
    M,
    M + wbW,
    M + wbW + trW,
    M + wbW + trW + remainingW / 2,
    W - M,
  ];
  const refRow = (
    label: string,
    value: string,
    col: number,
    valueColor: [number, number, number] = INK,
  ) => {
    const cx = colBounds[col] + refPad;
    sectionLabel(doc, label, cx, y + 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(refSize);
    doc.setTextColor(...valueColor);
    doc.text(value, cx, y + 12.2);
    doc.setFont("helvetica", "normal");
  };

  refRow("Waybill No.", refValues[0], 0, CYAN);
  refRow("Tracking No.", refValues[1], 1);
  refRow("Status", refValues[2], 2);
  refRow("Issue Date", refValues[3], 3);
  doc.setDrawColor(...RULE);
  for (let i = 1; i < 4; i++) {
    doc.line(colBounds[i], y + 3, colBounds[i], y + refH - 3);
  }

  // ── 3. SHIP FROM / SHIP TO panels ──────────────────────────────────────────
  y += refH + 8;
  const panelW = (CONTENT_W - 6) / 2;
  const drawPartyPanel = (
    x: number,
    kicker: string,
    name: string,
    nameSub: string | null,
    contactLines: string[],
    addressLines: string[],
  ): number => {
    sectionLabel(doc, kicker, x, y);
    let py = y + 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(name, x, py);
    py += 4.6;
    if (nameSub) {
      mutedValue(doc, nameSub, x, py);
      py += 4.6;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    for (const line of addressLines) {
      const wrapped = doc.splitTextToSize(line, panelW - 6);
      doc.text(wrapped, x, py);
      py += 4.4 * wrapped.length;
    }
    doc.setTextColor(...MUTED);
    for (const line of contactLines) {
      doc.text(line, x, py);
      py += 4.4;
    }
    return py;
  };

  const sender = p.sender;
  const businessLine = p.businessName ? [p.businessName] : [];
  const leftBottom = drawPartyPanel(
    M,
    "Ship From",
    sender?.name ?? "—",
    sender?.email ?? null,
    [...businessLine, ...(sender?.phone ? [`Tel: ${sender.phone}`] : [])],
    [`Collection: ${p.pickup.label}`, ...fmtAddress(p.pickup)],
  );

  const recLines: string[] = [];
  if (p.recipient.phone) recLines.push(`Tel: ${p.recipient.phone}`);
  const rightBottom = drawPartyPanel(
    M + panelW + 6,
    "Ship To",
    p.recipient.name ?? "Not specified",
    null,
    recLines,
    [`Delivery: ${p.dropoff.label}`, ...fmtAddress(p.dropoff)],
  );

  y = Math.max(leftBottom, rightBottom) + 3;
  doc.setDrawColor(...RULE);
  doc.line(M, y, W - M, y);

  // ── 4. Consignment details table ───────────────────────────────────────────
  y += 9;
  sectionLabel(doc, "Consignment Details", M, y);
  y += 4;

  const tableCols = [
    { key: "goods", label: "Goods Description", x: 0, w: 62 },
    { key: "class", label: "Class / Type", x: 62, w: 34 },
    { key: "size", label: "Size", x: 96, w: 24 },
    { key: "dims", label: "Dimensions", x: 120, w: 38 },
    { key: "weight", label: "Weight", x: 158, w: 22 },
  ] as const;

  const rowH = 8;
  doc.setFillColor(...NAVY);
  doc.rect(M, y, CONTENT_W, rowH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  for (const c of tableCols) {
    doc.text(c.label.toUpperCase(), M + c.x + 3, y + 5.4);
  }
  y += rowH;

  const dims =
    p.parcel.width != null && p.parcel.height != null
      ? `${p.parcel.width} × ${p.parcel.height} cm`
      : "—";
  const dataRow: Record<string, string> = {
    goods: p.parcel.description ?? "Goods in transit",
    class: p.parcel.parcelType ? titleCase(p.parcel.parcelType) : "General",
    size: p.parcel.packageSize ?? "—",
    dims,
    weight: p.parcel.weight != null ? `${p.parcel.weight} kg` : "—",
  };

  const bodyH = 12;
  doc.setDrawColor(...RULE);
  doc.rect(M, y, CONTENT_W, bodyH, "S");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  for (const c of tableCols) {
    const wrapped = doc.splitTextToSize(dataRow[c.key], c.w - 5);
    doc.text(wrapped, M + c.x + 3, y + 5.6);
  }
  for (let i = 1; i < tableCols.length; i++) {
    doc.line(M + tableCols[i].x, y, M + tableCols[i].x, y + bodyH);
  }
  y += bodyH;

  // ── 5. Service & charges row ───────────────────────────────────────────────
  y += 8;
  const svcH = 15;
  doc.setFillColor(...PANEL_BG);
  doc.roundedRect(M, y, CONTENT_W, svcH, 1.5, 1.5, "F");
  doc.setDrawColor(...RULE);
  doc.roundedRect(M, y, CONTENT_W, svcH, 1.5, 1.5, "S");

  const svcColW = CONTENT_W / 3;
  const svcCell = (label: string, value: string, col: number, accent = false) => {
    const cx = M + col * svcColW + 5;
    sectionLabel(doc, label, cx, y + 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...(accent ? CYAN : INK));
    doc.text(value, cx, y + 11.6);
    doc.setFont("helvetica", "normal");
  };
  svcCell(
    "Service Level",
    p.parcel.expeditionType ? titleCase(p.parcel.expeditionType) : "Standard",
    0,
  );
  svcCell("Scheduled Pickup", fmtDateTime(p.scheduledTime), 1);
  svcCell("Total Charge", fmtZar(p.price), 2, true);
  doc.setDrawColor(...RULE);
  for (let i = 1; i < 3; i++) {
    doc.line(M + i * svcColW, y + 3, M + i * svcColW, y + svcH - 3);
  }

  // ── 6. Handling record ─────────────────────────────────────────────────────
  y += svcH + 8;
  sectionLabel(doc, "Handling Record", M, y);
  y += 4.5;

  const handling: Array<[string, string]> = [
    ["Requested", fmtDateTime(p.createdAt)],
    ["Scheduled", fmtDateTime(p.scheduledTime)],
    ["Collection started", fmtDateTime(p.startedAt)],
    ["Delivered / closed", fmtDateTime(p.completedAt)],
  ];
  const handRowH = 7.4;
  doc.setDrawColor(...RULE);
  for (const [label, value] of handling) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(label, M + 3, y + 5);
    doc.setTextColor(...INK);
    doc.text(value, M + 58, y + 5);
    doc.line(M, y + handRowH, W - M, y + handRowH);
    y += handRowH;
  }

  // Assigned courier line
  y += 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Assigned courier", M + 3, y + 5);
  doc.setTextColor(...INK);
  doc.text(
    p.courier ? `${p.courier.name}${p.courier.phone ? `  ·  ${p.courier.phone}` : ""}` : "Pending assignment",
    M + 58,
    y + 5,
  );

  // ── 7. Signature blocks ────────────────────────────────────────────────────
  // Clean signature line: one rule per block with "Signature" / "Date" printed
  // BELOW the line at its own anchor — no second line under the rule (the old
  // stray `doc.line` at the "Signature" label drew over the text).
  y += 12;
  const sigW = (CONTENT_W - 12) / 2;
  const sigBlock = (x: number, title: string) => {
    sectionLabel(doc, title, x, y);
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.3);
    doc.line(x, y + 14, x + sigW, y + 14);
    doc.setLineWidth(0.2);
    // Under-rule captions: "Signature" anchored at the rule's left end,
    // "Date" at the 62% mark — printed below the line, not over it.
    mutedValue(doc, "Signature", x, y + 18.5, 7.5);
    mutedValue(doc, "Date", x + sigW * 0.62, y + 18.5, 7.5);
    // Date tick separating the two halves of the rule.
    doc.setDrawColor(...RULE);
    doc.line(x + sigW * 0.58, y + 11, x + sigW * 0.58, y + 14);
  };
  sigBlock(M, "Driver Signature");
  sigBlock(M + sigW + 12, "Recipient Signature");

  // ── 8. Footer band ─────────────────────────────────────────────────────────
  const footY = H - 20;
  doc.setFillColor(...NAVY);
  doc.rect(0, footY, W, 20, "F");
  doc.setFillColor(...CYAN);
  doc.rect(0, footY, W, 1, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(190, 210, 220);
  doc.text(
    "This waybill accompanies the consignment at all times. Goods are carried subject to Lasha's standard terms and conditions of carriage.",
    M,
    footY + 7,
  );
  doc.text(
    "Verify recipient identity against this document before releasing any consignment.",
    M,
    footY + 11.5,
  );
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`${p.waybillNumber}  ·  Page 1 of 1`, W - M, footY + 11.5, { align: "right" });

  doc.save(`${p.waybillNumber}.pdf`);
}
