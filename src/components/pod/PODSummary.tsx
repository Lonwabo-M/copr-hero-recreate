import {
  Calendar,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  ImageOff,
  MapPin,
  Phone,
  User,
  XCircle,
} from "lucide-react";
import { formatPODBytes, podOutcomeLabel } from "@/lib/pod";
import "@/styles/pod.css";

export interface PODFileView {
  _id?: string;
  fileName: string;
  fileType: string;
  mimeType: string;
  fileSize?: number;
  url: string | null;
}

export interface PODView {
  _id?: string;
  outcome: string;
  recipientName: string;
  recipientPhone?: string | null;
  deliveryNotes?: string | null;
  failureReason?: string | null;
  failureNotes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationAccuracy?: number | null;
  deliveredAt: number;
  files?: PODFileView[] | null;
}

interface PODSummaryProps {
  pod: PODView;
  showCoordinates?: boolean;
  title?: string;
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

/**
 * Read-only proof-of-delivery record.
 *
 * The caller must have obtained `pod` from the authorized
 * `getPODForDelivery` / `getPOD` query. This component never fetches storage
 * IDs or constructs a URL by itself; it only renders the URLs returned after
 * the server checked delivery ownership.
 */
export default function PODSummary({ pod, showCoordinates = false, title = "Proof of delivery" }: PODSummaryProps) {
  const files = pod.files ?? [];
  const signature = files.find((file) => file.fileType === "signature");
  const photos = files.filter((file) => file.fileType === "photo");
  const documents = files.filter((file) => file.fileType === "document");
  const delivered = pod.outcome === "delivered";
  const hasLocation = pod.latitude != null && pod.longitude != null;

  return (
    <section className="pod-card" aria-label={title}>
      <div className="pod-head">
        <div className="pod-heading">
          <span className={`pod-icon ${delivered ? "is-success" : "is-failure"}`}>
            {delivered ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
          </span>
          <div>
            <h3 className="pod-title">{title}</h3>
            <p className="pod-subtitle">
              {delivered ? "Signed handover record" : "Delivery exception record"}
            </p>
          </div>
        </div>
        <span className={`pod-outcome ${delivered ? "is-success" : "is-failure"}`}>
          {podOutcomeLabel(pod.outcome)}
        </span>
      </div>

      <div className="pod-details">
        <div className="pod-detail">
          <User size={13} />
          <span className="pod-detail-label">{delivered ? "Received by" : "Recipient"}</span>
          <span className="pod-detail-value">
            {pod.recipientName && pod.recipientName !== "N/A"
              ? pod.recipientName
              : "Not recorded"}
          </span>
        </div>
        {pod.recipientPhone && (
          <div className="pod-detail">
            <Phone size={13} />
            <span className="pod-detail-label">Recipient phone</span>
            <span className="pod-detail-value">{pod.recipientPhone}</span>
          </div>
        )}
        <div className="pod-detail">
          <Calendar size={13} />
          <span className="pod-detail-label">Recorded</span>
          <span className="pod-detail-value">{formatDateTime(pod.deliveredAt)}</span>
        </div>
        {hasLocation && (
          <div className="pod-detail">
            <MapPin size={13} />
            <span className="pod-detail-label">Handover location</span>
            <span className="pod-detail-value">
              {showCoordinates
                ? `${pod.latitude!.toFixed(5)}, ${pod.longitude!.toFixed(5)}`
                : "Captured at the delivery point"}
              {pod.locationAccuracy != null ? ` · ±${Math.round(pod.locationAccuracy)}m` : ""}
            </span>
          </div>
        )}
      </div>

      {pod.deliveryNotes && (
        <div className="pod-note">
          <span className="pod-note-label">Delivery notes</span>
          <p>{pod.deliveryNotes}</p>
        </div>
      )}

      {!delivered && (pod.failureReason || pod.failureNotes) && (
        <div className="pod-note is-failure">
          <span className="pod-note-label">Failure details</span>
          <p>
            {pod.failureReason ? humanize(pod.failureReason) : "Delivery failed"}
            {pod.failureNotes ? ` — ${pod.failureNotes}` : ""}
          </p>
        </div>
      )}

      <div className="pod-evidence">
        <div className="pod-evidence-head">
          <span>
            <FileCheck2 size={14} />
            Evidence
          </span>
          <span className="pod-evidence-count">
            {files.length === 0
              ? "No files"
              : `${files.length} file${files.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {files.length === 0 ? (
          <div className="pod-empty">
            <ImageOff size={16} />
            <span>No evidence files were attached to this record.</span>
          </div>
        ) : (
          <>
            {signature && (
              <figure className="pod-signature-evidence">
                <div className="pod-signature-image">
                  {signature.url ? (
                    <img
                      src={signature.url}
                      alt={`Signature from ${pod.recipientName || "recipient"}`}
                      loading="lazy"
                    />
                  ) : (
                    <div className="pod-file-unavailable">
                      <ImageOff size={18} />
                      Signature unavailable
                    </div>
                  )}
                </div>
                <figcaption>
                  <span>Recipient signature</span>
                  {signature.url && (
                    <a href={signature.url} target="_blank" rel="noreferrer">
                      <Download size={12} /> Open
                    </a>
                  )}
                </figcaption>
              </figure>
            )}

            {photos.length > 0 && (
              <div className="pod-photo-grid">
                {photos.map((photo, index) => (
                  <figure className="pod-photo" key={photo._id ?? `${photo.fileName}-${index}`}>
                    {photo.url ? (
                      <a href={photo.url} target="_blank" rel="noreferrer">
                        <img
                          src={photo.url}
                          alt={`Delivery evidence ${index + 1}`}
                          loading="lazy"
                        />
                      </a>
                    ) : (
                      <div className="pod-file-unavailable">
                        <ImageOff size={18} />
                        Unavailable
                      </div>
                    )}
                    <figcaption>
                      <span>Photo {index + 1}</span>
                      {photo.url && (
                        <a href={photo.url} target="_blank" rel="noreferrer">
                          <Download size={12} /> Open
                        </a>
                      )}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}

            {documents.length > 0 && (
              <div className="pod-documents">
                {documents.map((document, index) => (
                  <a
                    className="pod-document"
                    key={document._id ?? `${document.fileName}-${index}`}
                    href={document.url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={!document.url}
                  >
                    <FileText size={15} />
                    <span>
                      <strong>{document.fileName || "Document"}</strong>
                      <small>{formatPODBytes(document.fileSize ?? 0)}</small>
                    </span>
                    <Download size={13} />
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
