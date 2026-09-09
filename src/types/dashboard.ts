/**
 * Dashboard domain types shared across dashboard components.
 *
 * These types define the shape of order data displayed in the dashboard.
 * The Dashboard.tsx page transforms Convex delivery data into this shape.
 */

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
  registration: string;
  capacity: string;
  breaking: string;
  express: string;
  flammable: string;
  trailer: string;
  time: string;
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
  status: "In Transit" | "Pending";
  pickup: PickupInfo;
  dropoff: DropoffInfo;
  vehicle: VehicleInfo;
  driver: DriverInfo;
  customer: CustomerInfo;
}
