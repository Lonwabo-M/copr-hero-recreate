import { jsPDF } from "jspdf";

// ─── Waybill PDF ─────────────────────────────────────────────────────────────
// Renders the server-resolved waybill payload (see
// deliveries.waybills.getWaybillForOps) into a clean A4 document and triggers
// the browser download. No backend PDF service — the payload is authoritative,
// the browser just renders it.

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

const NAVY: [number, number, number] = [16, 34, 51];
const CYAN: [number, number, number] = [7, 148, 181];
const MUTED: [number, number, number] = [107, 122, 137];

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

function fmtAddress(a: WaybillPayload["pickup"]): string {
  const parts = [a.street, a.city, a.zip].filter((p): p is string => !!p && p.length > 0);
  return parts.length > 0 ? parts.join(", ") : "Address on file";
}

function fmtZar(cents: number | null): string {
  if (cents === null || cents === undefined) return "—";
  return `R${(cents / 100).toFixed(2)}`;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function downloadWaybillPdf(p: WaybillPayload): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 16; // page margin

  // Header band
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Lasha", M, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(190, 210, 220);
  doc.text("Waybill / Consignment Note", M, 21);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(p.waybillNumber, W - M, 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(190, 210, 220);
  doc.text(`Issued ${fmtDateTime(p.createdAt)}`, W - M, 21, { align: "right" });

  // Tracking + status strip
  let y = 40;
  doc.setTextColor(...MUTED);
  doc.setFontSize(8);
  doc.text("TRACKING NUMBER", M, y);
  doc.text("STATUS", 110, y);
  y += 5.5;
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(p.trackingNumber, M, y);
  doc.setTextColor(...CYAN);
  doc.text(statusLabel(p.status), 110, y);

  // Parties
  y += 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("FROM (SENDER)", M, y);
  doc.text("TO (RECIPIENT)", 110, y);

  y += 5.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  const senderLines: string[] = p.sender ? [p.sender.name] : ["—"];
  if (p.sender?.phone) senderLines.push(p.sender.phone);
  if (p.sender?.email) senderLines.push(p.sender.email);
  senderLines.push(`Pickup: ${fmtAddress(p.pickup)}`);

  const recLines: string[] = [p.recipient.name ?? "Not specified"];
  if (p.recipient.phone) recLines.push(p.recipient.phone);
  recLines.push(`Drop-off: ${fmtAddress(p.dropoff)}`);
  if (p.courier) recLines.push(`Driver: ${p.courier.name}${p.courier.phone ? ` · ${p.courier.phone}` : ""}`);

  const leftTop = y;
  let ly = y;
  for (const line of senderLines) {
    doc.text(doc.splitTextToSize(line, 82), M, ly);
    ly += 5;
  }
  let ry = leftTop;
  for (const line of recLines) {
    doc.text(doc.splitTextToSize(line, 82), 110, ry);
    ry += 5;
  }

  y = Math.max(ly, ry) + 4;

  // Divider
  doc.setDrawColor(223, 230, 236);
  doc.line(M, y, W - M, y);
  y += 8;

  // Parcel block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("PARCEL", M, y);
  y += 5.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);

  const dims =
    p.parcel.width !== null || p.parcel.height !== null || p.parcel.weight !== null
      ? [
          p.parcel.width !== null ? `${p.parcel.width} cm w` : null,
          p.parcel.height !== null ? `${p.parcel.height} cm h` : null,
          p.parcel.weight !== null ? `${p.parcel.weight} kg` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  const parcelLines = [
    p.parcel.description ?? "Goods in transit",
    [
      p.parcel.parcelType ? `Type: ${p.parcel.parcelType.replace(/_/g, " ")}` : null,
      p.parcel.packageSize ? `Size: ${p.parcel.packageSize}` : null,
      p.parcel.expeditionType ? `Service: ${p.parcel.expeditionType.replace(/_/g, "-")}` : null,
    ]
      .filter(Boolean)
      .join("   ·   ") || null,
    dims,
    `Charge: ${fmtZar(p.price)}`,
    `Scheduled: ${fmtDateTime(p.scheduledTime)}`,
  ].filter((l): l is string => !!l);

  for (const line of parcelLines) {
    doc.text(doc.splitTextToSize(line, W - M * 2), M, y);
    y += 5;
  }

  // Timeline block
  y += 4;
  doc.setDrawColor(223, 230, 236);
  doc.line(M, y, W - M, y);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("HANDLING", M, y);
  y += 5.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(`Requested: ${fmtDateTime(p.createdAt)}`, M, y);
  y += 5;
  doc.text(`Started: ${fmtDateTime(p.startedAt)}`, M, y);
  y += 5;
  doc.text(`Completed: ${fmtDateTime(p.completedAt)}`, M, y);

  // Footer
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(...NAVY);
  doc.rect(0, pageH - 18, W, 18, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(190, 210, 220);
  doc.text(
    "This waybill accompanies the consignment at all times. Verify recipient identity on delivery.",
    M,
    pageH - 10,
  );
  doc.text("lasha.co.za · move goods smarter", W - M, pageH - 10, { align: "right" });

  doc.save(`${p.waybillNumber}.pdf`);
}
