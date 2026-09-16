import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Download, Loader2 } from "lucide-react";
import { downloadWaybillPdf, type WaybillPayload } from "@/lib/waybill-pdf";

// ─── Waybill download button (Operations Centre) ─────────────────────────────
// The waybill is created automatically with the delivery (waybillNumber is
// stamped at creation); this button fetches its server-resolved payload on
// click and renders the PDF client-side.

export default function WaybillButton({ deliveryId }: { deliveryId: string }) {
  const [fetching, setFetching] = useState(false);
  const waybill = useQuery(
    api.deliveries.waybills.getWaybillForOps,
    fetching ? { deliveryId: deliveryId as any } : "skip",
  );
  const downloaded = useRef(false);

  // One-shot: as soon as the armed query resolves, save the PDF and disarm.
  useEffect(() => {
    if (fetching && waybill && !downloaded.current) {
      downloaded.current = true;
      downloadWaybillPdf(waybill as unknown as WaybillPayload);
      setFetching(false);
    }
  }, [fetching, waybill]);

  return (
    <button
      className="ops-btn ops-btn-sm"
      disabled={fetching}
      onClick={() => {
        downloaded.current = false;
        setFetching(true);
      }}
      title="Download waybill (PDF)"
    >
      {fetching ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Download size={14} />
      )}
      Waybill
    </button>
  );
}
