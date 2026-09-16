import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { APP_AREAS, RoleGate } from "@/components/shells/RoleGate";
import { homeRouteForRole } from "@/components/shells/roleAccess";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

import Landing from "./pages/Landing.tsx";
import AuthPage from "./pages/Auth.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import RequestDelivery from "./pages/RequestDelivery.tsx";
import Checkout from "./pages/Checkout.tsx";
import TrackDelivery from "./pages/TrackDelivery.tsx";
import DeliveryTracking from "./pages/DeliveryTracking.tsx";
import Wallet from "./pages/Wallet.tsx";
import Settings from "./pages/Settings.tsx";
import PastDeliveries from "./pages/PastDeliveries.tsx";
import Invoices from "./pages/Invoices.tsx";
import MakePayment from "./pages/MakePayment.tsx";
import Notifications from "./pages/Notifications.tsx";
import Help from "./pages/Help.tsx";
import Legal from "./pages/Legal.tsx";
import Downloads from "./pages/Downloads.tsx";
import NotFound from "./pages/NotFound.tsx";
import OperationsCentre from "./pages/OperationsCentre.tsx";
import DriverActiveDelivery from "./pages/DriverActiveDelivery.tsx";
import DriverHome from "./pages/DriverHome.tsx";
import DriverOffers from "./pages/DriverOffers.tsx";
import DriverHistory from "./pages/DriverHistory.tsx";
import DriverDeliveryDetail from "./pages/DriverDeliveryDetail.tsx";
import DriverEarnings from "./pages/DriverEarnings.tsx";
import DriverProfile from "./pages/DriverProfile.tsx";
import PostAuthRedirect from "./pages/PostAuthRedirect.tsx";
import CustomerOnboarding from "./pages/CustomerOnboarding.tsx";

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in WebContainer environment). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[WebContainer preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);



/** Role-aware post-auth entry: resolves the signed-in user's home route via
 *  PostAuthRedirect (customer → /dashboard, driver → /driver, ops → /operations). */

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}


// ─── Route Architecture ──────────────────────────────────────────────────────
// URL structure reflects the four role-specific application experiences:
//
//   Customer Portal    /dashboard /request-delivery /track-delivery ...
//   Driver App         /driver /driver/active-delivery
//   Operations Centre  /operations
//
// Every protected route is wrapped in RoleGate, which layers role-aware area
// checks on top of the existing RequireAuth (authentication + returnTo). The
// frontend is a convenience boundary only — Convex remains the authoritative
// authorization layer for all data access.
//
// Backwards compatibility: the existing customer routes are unchanged. Legacy
// aliases (e.g. /driver/active-delivery already existed) keep working.

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/post-auth" element={<PostAuthRedirect />} />

              {/* ─── Customer Onboarding ───────────────────────────────── */}
              <Route
                path="/onboarding/customer"
                element={
                  <RoleGate area={APP_AREAS.CUSTOMER}>
                    <CustomerOnboarding />
                  </RoleGate>
                }
 />

              {/* ─── Customer Portal ──────────────────────────────────── */}
              <Route
                path="/dashboard"
                element={
                  <RoleGate area={APP_AREAS.CUSTOMER}>
                    <Dashboard />
                  </RoleGate>
                }
              />
              <Route
                path="/request-delivery"
                element={
                  <RoleGate area={APP_AREAS.CUSTOMER}>
                    <RequestDelivery />
                  </RoleGate>
                }
              />
              <Route
                path="/checkout/:orderId"
                element={
                  <RoleGate area={APP_AREAS.CUSTOMER}>
                    <Checkout />
                  </RoleGate>
                }
              />
              <Route
                path="/track-delivery"
                element={
                  <RoleGate area={APP_AREAS.CUSTOMER}>
                    <TrackDelivery />
                  </RoleGate>
                }
              />
              <Route
                path="/deliveries/:deliveryId"
                element={
                  <RoleGate area={APP_AREAS.CUSTOMER}>
                    <DeliveryTracking />
                  </RoleGate>
                }
              />
              <Route
                path="/wallet"
                element={
                  <RoleGate area={APP_AREAS.CUSTOMER}>
                    <Wallet />
                  </RoleGate>
                }
              />
              <Route
                path="/make-payment"
                element={
                  <RoleGate area={APP_AREAS.CUSTOMER}>
                    <MakePayment />
                  </RoleGate>
                }
              />
              <Route
                path="/past-deliveries"
                element={
                  <RoleGate area={APP_AREAS.CUSTOMER}>
                    <PastDeliveries />
                  </RoleGate>
                }
              />
              <Route
                path="/invoices"
                element={
                  <RoleGate area={APP_AREAS.CUSTOMER}>
                    <Invoices />
                  </RoleGate>
                }
              />
              <Route
                path="/notifications"
                element={
                  <RoleGate area={APP_AREAS.CUSTOMER}>
                    <Notifications />
                  </RoleGate>
                }
              />
              <Route
                path="/settings"
                element={
                  <RoleGate area={APP_AREAS.CUSTOMER}>
                    <Settings />
                  </RoleGate>
                }
              />
              <Route
                path="/help"
                element={
                  <RoleGate area={APP_AREAS.CUSTOMER}>
                    <Help />
                  </RoleGate>
                }
              />
              <Route
                path="/legal"
                element={
                  <RoleGate area={APP_AREAS.CUSTOMER}>
                    <Legal />
                  </RoleGate>
                }
              />
              <Route
                path="/downloads"
                element={
                  <RoleGate area={APP_AREAS.CUSTOMER}>
                    <Downloads />
                  </RoleGate>
                }
              />

              {/* ─── Driver App ───────────────────────────────────────── */}
              <Route
                path="/driver"
                element={
                  <RoleGate area={APP_AREAS.DRIVER}>
                    <DriverHome />
                  </RoleGate>
                }
              />
              <Route
                path="/driver/offers"
                element={
                  <RoleGate area={APP_AREAS.DRIVER}>
                    <DriverOffers />
                  </RoleGate>
                }
              />
              <Route
                path="/driver/history"
                element={
                  <RoleGate area={APP_AREAS.DRIVER}>
                    <DriverHistory />
                  </RoleGate>
                }
              />
              <Route
                path="/driver/history/:deliveryId"
                element={
                  <RoleGate area={APP_AREAS.DRIVER}>
                    <DriverDeliveryDetail />
                  </RoleGate>
                }
              />
              <Route
                path="/driver/profile"
                element={
                  <RoleGate area={APP_AREAS.DRIVER}>
                    <DriverProfile />
                  </RoleGate>
                }
              />
              <Route
                path="/driver/earnings"
                element={
                  <RoleGate area={APP_AREAS.DRIVER}>
                    <DriverEarnings />
                  </RoleGate>
                }
              />
              <Route
                path="/driver/active-delivery"
                element={
                  <RoleGate area={APP_AREAS.DRIVER}>
                    <DriverActiveDelivery />
                  </RoleGate>
                }
              />

              {/* ─── Operations Centre ────────────────────────────────── */}
              <Route
                path="/operations"
                element={
                  <RoleGate area={APP_AREAS.OPERATIONS}>
                    <OperationsCentre />
                  </RoleGate>
                }
              />

              {/* ─── Admin ──────────────────────────────────────────────
                   No admin pages exist yet. /admin is not registered as a
                   route; admin-role users land in the Operations Centre via
                   homeRouteForRole(). Documented in docs/frontend-architecture.md */}

              <Route path="*" element={<NotFound />} />
            </Routes>
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
