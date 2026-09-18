import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ─── Leaflet operational map (Google Maps placeholder) ───────────────────────
// Renders the SAME data the previous inline SVG tactical map did — driver
// positions from getAvailableDriverLocations and pickup/dropoff coordinates
// from real delivery records — over OpenStreetMap tiles via Leaflet.
//
// Deliberate constraints (unchanged from the SVG map):
//  - No geolocation: the map never reads GPS from this browser.
//  - Markers are divIcon/circleMarker layers, so no bundler-hostile image
//    assets are required.
//  - All interaction (click → select delivery) is delegated upward; this
//    component holds no application state.

export interface LeafletDriverMarker {
  driverId: string;
  name: string;
  lat: number;
  lng: number;
  stale: boolean;
  trackingNumber: string | null;
  deliveryId: string | null;
}

export interface LeafletPointMarker {
  deliveryId: string;
  lat: number;
  lng: number;
  kind: "pickup" | "dropoff";
  selected: boolean;
}

interface OpsLeafletMapProps {
  drivers: LeafletDriverMarker[];
  pickups: LeafletPointMarker[];
  dropoffs: LeafletPointMarker[];
  /** Delivery route lines drawn pickup → dropoff where both coords exist. */
  routes: Array<{ from: [number, number]; to: [number, number]; selected: boolean }>;
  /** Delivery id of the selected delivery (driver marker emphasised). */
  selectedDeliveryId: string | null;
  onSelectDelivery: (deliveryId: string) => void;
  /** Pixel height of the map container. */
  height?: number;
}

const TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors — placeholder tiles (Google Maps pending)';

function markerHtml(color: string, emphasized: boolean, ring: boolean): string {
  const size = emphasized ? 16 : 12;
  const ringStyle = ring
    ? `box-shadow: 0 0 0 3px ${color}33;`
    : emphasized
      ? `box-shadow: 0 0 0 3px rgba(255,255,255,0.9), 0 0 0 5px ${color}55;`
      : "";
  return `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;${ringStyle}"></span>`;
}

export default function OpsLeafletMap({
  drivers,
  pickups,
  dropoffs,
  routes,
  selectedDeliveryId,
  onSelectDelivery,
  height = 420,
}: OpsLeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const selectRef = useRef(onSelectDelivery);
  selectRef.current = onSelectDelivery;

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [-29.5, 24.5], // South Africa — re-fitted to data below.
      zoom: 5,
      zoomControl: true,
      attributionControl: true,
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

  // Fit the viewport to the real data whenever its extent changes materially.
  const points = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = [];
    for (const d of drivers) pts.push([d.lat, d.lng]);
    for (const p of pickups) pts.push([p.lat, p.lng]);
    for (const d of dropoffs) pts.push([d.lat, d.lng]);
    return pts;
  }, [drivers, pickups, dropoffs]);

  const pointsKey = useMemo(() => {
    // Round to ~1km buckets so react renders don't re-fit on every GPS tick.
    return points.map(([a, b]) => `${a.toFixed(2)},${b.toFixed(2)}`).join("|");
  }, [points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;
    map.fitBounds(L.latLngBounds(points).pad(0.25));
    // pointsKey intentionally drives this — see memo above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey]);

  // Redraw markers + routes on every data change (cheap at ops scale).
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    for (const r of routes) {
      L.polyline([r.from, r.to], {
        color: r.selected ? "#0794B5" : "#94a3b8",
        weight: r.selected ? 3 : 1.5,
        opacity: r.selected ? 0.95 : 0.5,
        dashArray: r.selected ? undefined : "6 6",
      }).addTo(layer);
    }

    for (const p of pickups) {
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          html: markerHtml("#0794B5", p.selected, false),
          className: "ops-leaflet-marker",
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
        title: "Pickup",
      })
        .on("click", () => selectRef.current(p.deliveryId))
        .addTo(layer);
    }

    for (const d of dropoffs) {
      L.marker([d.lat, d.lng], {
        icon: L.divIcon({
          html: markerHtml("#856404", d.selected, false),
          className: "ops-leaflet-marker",
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
        title: "Drop-off",
      })
        .on("click", () => selectRef.current(d.deliveryId))
        .addTo(layer);
    }

    for (const dr of drivers) {
      const color = dr.stale ? "#C62828" : "#0A7C42";
      const emphasized = dr.deliveryId !== null && dr.deliveryId === selectedDeliveryId;
      const m = L.marker([dr.lat, dr.lng], {
        icon: L.divIcon({
          html: markerHtml(color, emphasized, dr.stale),
          className: "ops-leaflet-marker",
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
        title: dr.name || "Driver",
      });
      m.bindTooltip(
        `<strong>${dr.name || "Driver"}</strong>${dr.trackingNumber ? ` · ${dr.trackingNumber}` : ""}${dr.stale ? " · stale signal" : ""}`,
        { direction: "top", offset: [0, -8] },
      );
      if (dr.deliveryId) {
        m.on("click", () => selectRef.current(dr.deliveryId as string));
      }
      m.addTo(layer);
    }
  }, [drivers, pickups, dropoffs, routes, selectedDeliveryId]);

  return <div ref={containerRef} style={{ width: "100%", height }} className="ops-leaflet-map" />;
}
