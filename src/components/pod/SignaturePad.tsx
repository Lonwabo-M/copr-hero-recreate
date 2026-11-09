import { useEffect, useRef, useState, type PointerEvent } from "react";
import { RotateCcw } from "lucide-react";
import "@/styles/pod.css";

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 180;

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}

/**
 * Lightweight recipient signature capture.
 *
 * The canvas is drawn in logical 600x180 coordinates and scaled by CSS, so
 * pointer positions stay accurate on phones and desktop. We intentionally do
 * not add a signature library: the POD only needs a single PNG that is uploaded
 * through the same validated storage path as photos.
 */
export default function SignaturePad({ onChange, disabled = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const inkRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  // Start on an opaque white surface so the uploaded PNG is a normal document
  // image rather than a transparent layer that can look blank in some viewers.
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }, []);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    };
  };

  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    const position = point(event);
    if (!canvas || !position) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    context.beginPath();
    context.moveTo(position.x, position.y);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.6;
    context.strokeStyle = "#111827";
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    const canvas = canvasRef.current;
    const position = point(event);
    if (!canvas || !position) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    event.preventDefault();
    context.lineTo(position.x, position.y);
    context.stroke();
    inkRef.current = true;
    if (!hasInk) setHasInk(true);
  };

  const finish = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    if (inkRef.current && canvas) {
      onChange(canvas.toDataURL("image/png"));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    inkRef.current = false;
    setHasInk(false);
    onChange(null);
  };

  return (
    <div className="pod-signature">
      <div className="pod-signature-head">
        <span className="pod-signature-label">Recipient signature</span>
        <button
          type="button"
          className="pod-signature-clear"
          onClick={clear}
          disabled={disabled || !hasInk}
        >
          <RotateCcw size={12} />
          Clear
        </button>
      </div>
      <div className={`pod-signature-frame ${disabled ? "is-disabled" : ""}`}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="pod-signature-canvas"
          role="img"
          aria-label="Recipient signature drawing area"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
        />
        {!hasInk && (
          <span className="pod-signature-placeholder" aria-hidden="true">
            Ask the recipient to sign here
          </span>
        )}
      </div>
      <p className="pod-signature-hint">
        {disabled
          ? "Remove a photo to add a signature (maximum 5 evidence files)."
          : "Sign with a finger or stylus. A photo is a valid alternative if the recipient cannot sign."}
      </p>
    </div>
  );
}
