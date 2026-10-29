/**
 * Dashboard domain types shared across dashboard components.
 *
 * These types define the shape of order data displayed in the dashboard.
 * The Dashboard.tsx page transforms Convex delivery data into this shape.
 */
import type { OrderStatus } from "@/lib/orderStatus";

export interface PickupInfo {
  name: string;
  address: string;
  date: string;
  time: string;
}

export interface DropoffInfo {
  name: string;
  address: string;
}

export interface VehicleInfo {
  /** License plate / fleet registration, e.g. "FR35C0 GP". */
  registration: string;
  /** Vehicle brand, e.g. "Toyota". */
  make: string;
  /** Vehicle model, e.g. "Quantum". */
  model: string;
  /** Model year, when known. */
  year: string;
  /** Rated load capacity, e.g. "1 200 kg". */
  capacity: string;
  /** Handling capability flags, "Yes"/"No"/"N/A". */
  breaking: string;
  express: string;
  flammable: string;
  trailer: string;
}

export interface DriverInfo {
  name: string;
  license: string;
  phone: string;
  rating: string;
  trips: string;
}

export interface CustomerInfo {
  name: string;
  company: string;
  email: string;
  phone: string;
}

export interface Order {
  id: string;
  status: OrderStatus;
  pickup: PickupInfo;
  dropoff: DropoffInfo;
  vehicle: VehicleInfo;
  driver: DriverInfo;
  customer: CustomerInfo;
}
