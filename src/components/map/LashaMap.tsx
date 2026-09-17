import { useEffect, useRef, useState, type ReactNode } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ─── LashaMap ────────────────────────────────────────────────────────────────
// One reusable map surface for the whole platform (Operations "Live Map",
// customer tracking, driver run sheets). Backed by Leaflet + OpenStreetMap
// tiles as the current provider; it is deliberately a thin wrapper so the tile
// layer can be swapped for Google Maps later without touching any caller.
//
// Notes:
//  - Markers are drawn as CircleMarkers (vector, no image assets), so the
//    Leaflet default-icon asset problem never appears under the bundler.
//  - The map only ever plots coordinates that were passed in — it never
//    fabricates or interpolates a position.
//  - `fallback` renders if Leaflet cannot initialise at all.

export type MapPointKind = "driver" | "pickup" | "dropoff" | "point";

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  /** Optional caption rendered as the marker tooltip. */
  label?: string;
  kind?: MapPointKind;
}

export interface MapCoordinate {
  lat: number;
  lng: number;
}

interface LashaMapProps {
  points?: MapPoint[];
  /** Optional ordered path (e.g. pickup → driver → drop-off). */
  route?: MapCoordinate[];
  height?: number | string;
  className?: string;
  /** Rendered instead of the map when it cannot be created. */
  fallback?: ReactNode;
  /** Shown as a small overlay when there is nothing to plot. */
  emptyLabel?: string;
}

const JOHANNESBURG: [number, number] = [-26.2041, 28.0473];

const KIND_COLORS: Record<MapPointKind, string> = {
  driver: "#0794B5",
  pickup: "#0A7C42",
  dropoff: "#B45309",
  point: "#334155",
};

export default function LashaMap({
  points = [],
  route,
  height = 360,
  className,
  fallback,
  emptyLabel = "No live positions to plot yet",
}: LashaMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [failed, setFailed] = useState(false);

  // Create the map exactly once. The tile URL/attribution is the single place
  // that knows which map provider is in use.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    try {
      const map = L.map(container, {
        center: JOHANNESBURG,
        zoom: 11,
        // The surrounding control room scrolls; never hijack the wheel.
        scrollWheelZoom: false,
        attributionControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      // The panel is often mounted while its parent is still laying out.
      const resize = window.setTimeout(() => map.invalidateSize(), 120);
      return () => {
        window.clearTimeout(resize);
        map.remove();
        mapRef.current = null;
        layerRef.current = null;
      };
    } catch (err) {
      console.error("[map] Leaflet failed to initialise:", err);
      setFailed(true);
      return;
    }
  }, []);

  // Sync markers / route whenever the data changes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    const valid = points.filter(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng),
    );

    for (const point of valid) {
      const color = KIND_COLORS[point.kind ?? "point"];
      const marker = L.circleMarker([point.lat, point.lng], {
        radius: point.kind === "driver" ? 8 : 6,
        color: "#ffffff",
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      });
      if (point.label) marker.bindTooltip(point.label, { direction: "top" });
      marker.addTo(layer);
    }

    const path = (route ?? []).filter(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng),
    );
    if (path.length > 1) {
      L.polyline(
        path.map((p) => [p.lat, p.lng] as [number, number]),
        { color: "#0794B5", weight: 3, opacity: 0.7, dashArray: "6 6" },
      ).addTo(layer);
    }

    const bounds = L.latLngBounds([
      ...valid.map((p) => [p.lat, p.lng] as [number, number]),
      ...path.map((p) => [p.lat, p.lng] as [number, number]),
    ]);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
    }
  }, [points, route]);

  if (failed) return <>{fallback ?? null}</>;

  return (
    <div
      className={className}
      style={{ position: "relative", height, width: "100%" }}
    >
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
      {points.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: "auto 12px 12px 12px",
            padding: "8px 12px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.92)",
            border: "1px solid #E5E7EB",
            fontFamily: "Inter, sans-serif",
            fontSize: 12.5,
            color: "#4B5563",
            pointerEvents: "none",
          }}
        >
          {emptyLabel}
        </div>
      )}
    </div>
  );
}
