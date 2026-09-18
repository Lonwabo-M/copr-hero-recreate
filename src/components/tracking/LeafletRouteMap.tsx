import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ─── Leaflet route map (customer tracking + driver active delivery) ──────────
// Placeholder for the Google Maps route view: renders the delivery's real
// pickup / dropoff / driver coordinates over OpenStreetMap tiles. Replaces the
// decorative SVG route schematic with a genuinely interactive map.
//
// Constraints:
//  - Read-only coordinates from the delivery record — no geolocation, nothing
//    is measured or sent from this browser.
//  - The two usages (DeliveryTracking / TrackDelivery via TrackingProgress and
//    DriverActiveDelivery) pass identical point shapes, so one component
//    serves every route map in the app.

interface LeafletRouteMapProps {
  pickup?: { lat?: number | null; lng?: number | null } | null;
  dropoff?: { lat?: number | null; lng?: number | null } | null;
  driver?: { lat?: number | null; lng?: number | null } | null;
  /** Pixel height of the map container. */
  height?: number;
}

const TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors — placeholder tiles (Google Maps pending)';

function pointHtml(color: string, label: string): string {
  return `<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${color};color:#fff;font:600 9px/1 system-ui,sans-serif;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3)">${label}</span>`;
}

export default function LeafletRouteMap({
  pickup,
  dropoff,
  driver,
  height = 260,
}: LeafletRouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const points = useMemo<Array<L.LatLngTuple>>(() => {
    const pts: Array<L.LatLngTuple> = [];
    if (pickup?.lat != null && pickup?.lng != null) pts.push([pickup.lat, pickup.lng]);
    if (dropoff?.lat != null && dropoff?.lng != null) pts.push([dropoff.lat, dropoff.lng]);
    if (driver?.lat != null && driver?.lng != null) pts.push([driver.lat, driver.lng]);
    return pts;
  }, [pickup, dropoff, driver]);

  // Create once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false, // page scroll first; zoom on demand
    });
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Re-fit + redraw when the points change.
  const pointsKey = points.map((p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`).join("|");

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    if (points.length === 0) return;

    map.fitBounds(L.latLngBounds(points).pad(0.35));

    if (pickup?.lat != null && pickup?.lng != null) {
      L.marker([pickup.lat, pickup.lng], {
        icon: L.divIcon({
          html: pointHtml("#0794B5", "P"),
          className: "ops-leaflet-marker",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        title: "Pickup",
      }).addTo(layer);
    }
    if (dropoff?.lat != null && dropoff?.lng != null) {
      L.marker([dropoff.lat, dropoff.lng], {
        icon: L.divIcon({
          html: pointHtml("#856404", "D"),
          className: "ops-leaflet-marker",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        title: "Drop-off",
      }).addTo(layer);
    }
    if (driver?.lat != null && driver?.lng != null) {
      L.marker([driver.lat, driver.lng], {
        icon: L.divIcon({
          html: pointHtml("#0A7C42", "◈"),
          className: "ops-leaflet-marker",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        title: "Driver",
      }).addTo(layer);
    }

    // Route line pickup → dropoff (straight leg — real routing comes with
    // the Google Maps integration).
    if (pickup?.lat != null && pickup?.lng != null && dropoff?.lat != null && dropoff?.lng != null) {
      L.polyline(
        [
          [pickup.lat, pickup.lng],
          [dropoff.lat, dropoff.lng],
        ],
        { color: "#0794B5", weight: 2.5, opacity: 0.85, dashArray: "1 8", lineCap: "round" },
      ).addTo(layer);
    }
    // pointsKey intentionally drives the redraw — see memo above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey]);
  return <div ref={containerRef} style={{ width: "100%", height }} className="track-leaflet-map" />;
}
