/**
 * Lasha Domain Hooks
 *
 * Thin abstractions over Convex queries/mutations that the React UI consumes.
 * Each hook maps directly to a Convex function — no duplicated server state.
 */

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

// ─── Auth ────────────────────────────────────────────────────────────────────

/** Current authenticated user (or null). */
export function useCurrentUser() {
  return useQuery(api.users.currentUser);
}

// ─── Deliveries ──────────────────────────────────────────────────────────────

/** All deliveries visible to the current user. */
export function useMyDeliveries() {
  return useQuery(api.deliveries.state_machine.getMyDeliveries, {});
}

/** Active (non-terminal) deliveries visible to the current user. */
export function useActiveDeliveries() {
  const all = useQuery(api.deliveries.state_machine.getMyDeliveries, {});
  if (all === undefined) return undefined;
  return all.filter(
    (d: any) =>
      !["delivered", "cancelled", "failed"].includes(d.status)
  );
}

/** Single delivery by ID. */
export function useDelivery(deliveryId: string | null) {
  return useQuery(
    api.deliveries.state_machine.getDelivery,
    deliveryId ? { deliveryId: deliveryId as any } : "skip"
  );
}

// ─── Driver / Trip ───────────────────────────────────────────────────────────

/** Current driver's active delivery (driver role only). */
export function useActiveDelivery() {
  return useQuery(api.tracking.queries.getMyCurrentDelivery, {});
}

/** Available driver locations for operations view. */
export function useAvailableDriverLocations() {
  return useQuery(api.tracking.queries.getAvailableDriverLocations, {});
}

/** Driver's delivery history. */
export function useDriverDeliveryHistory(driverId?: string) {
  return useQuery(
    api.tracking.queries.getDriverDeliveryHistory,
    driverId ? { driverId: driverId as any } : "skip"
  );
}


// ─── Dispatch ────────────────────────────────────────────────────────────────

/** Pending dispatch offers for a specific delivery. */
export function useDispatchOffers(deliveryId?: string) {
  return useQuery(
    api.dispatch.engine.getDispatchOffers,
    deliveryId ? { deliveryId: deliveryId as any } : "skip"
  );
}

/** My dispatch offers (for driver role). */
export function useMyDispatchOffers() {
  return useQuery(api.dispatch.engine.getMyDispatchOffers, {});
}

// ─── Wallet & Payments ───────────────────────────────────────────────────────

/** Current user's wallet. */
export function useWallet() {
  return useQuery(api.users.getWallet);
}

/** Current user's transactions. */
export function useTransactions() {
  return useQuery(api.users.getTransactions, {});
}

// ─── Invoices ────────────────────────────────────────────────────────────────

/** Current user's invoices. */
export function useInvoices() {
  return useQuery(api.users.getInvoices);
}

// ─── Past Deliveries ─────────────────────────────────────────────────────────

/** Completed/cancelled deliveries for the current user. */
export function usePastDeliveries() {
  return useQuery(api.users.getPastDeliveries);
}

// ─── Notifications ───────────────────────────────────────────────────────────

/** Current user's notifications. */
export function useNotifications() {
  return useQuery(api.notifications.service.getMyNotifications, {});
}

/** Unread notification count. */
export function useUnreadNotificationCount() {
  return useQuery(api.notifications.service.getUnreadCount, {});
}

/** The current user's business profile (or null). */
export function useMyBusiness() {
  return useQuery(api.users.businessProfile.getMyBusiness, {});
}

/** Notification preferences. */
export function useNotificationPreferences() {
  return useQuery(api.notifications.service.getMyPreferences, {});
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

/** Active pricing rules. */
export function useActivePricingRules() {
  return useQuery(api.pricing.service.getActivePricingRules, {});
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/** Create an order with delivery in one step. */
export function useCreateOrderAndDelivery() {
  return useMutation(api.deliveries.state_machine.createOrderAndDelivery);
}

/** Create a delivery from an existing order. */
export function useCreateDelivery() {
  return useMutation(api.deliveries.state_machine.createDelivery);
}

/** Dispatch a delivery to the dispatch engine. */
export function useDispatchDelivery() {
  return useMutation(api.deliveries.state_machine.dispatchDelivery);
}

/** Accept a dispatch assignment. */
export function useAcceptAssignment() {
  return useMutation(api.dispatch.engine.acceptAssignment);
}

/** Reject a dispatch assignment. */
export function useRejectAssignment() {
  return useMutation(api.dispatch.engine.rejectAssignment);
}

/** Mark notification as read. */
export function useMarkNotificationRead() {
  return useMutation(api.notifications.service.markAsRead);
}

/** Mark all notifications as read. */
export function useMarkAllNotificationsRead() {
  return useMutation(api.notifications.service.markAllAsRead);
}

/** Update notification preferences. */
export function useUpdateNotificationPreferences() {
  return useMutation(api.notifications.service.updatePreferences);
}

/** Update the current user's own profile (name, phone). */
export function useUpdateMyProfile() {
  return useMutation(api.users.updateMyProfile);
}

/** Update the current user's business profile (name, phone, address, registration). */
export function useUpdateMyBusiness() {
  return useMutation(api.users.businessProfile.updateMyBusiness);
}
