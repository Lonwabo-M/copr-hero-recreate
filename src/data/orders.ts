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

export const orders: Order[] = [
  {
    id: "#55667",
    status: "In Transit",
    pickup: {
      name: "Sunday Creatives",
      address: "Cnr New Market Rd, NSO",
      date: "03 Jan",
      time: "19:43 PM",
    },
    dropoff: {
      name: "Fourways Mall",
      address: "Cnr William Ave",
    },
    vehicle: {
      registration: "FR35C0 GP",
      capacity: "859 KG",
      breaking: "Yes",
      express: "Yes",
      flammable: "No",
      trailer: "Yes",
      time: "19:43 PM",
    },
    driver: {
      name: "Thabo Mokoena",
      license: "B Code 08",
      phone: "+27 72 456 7890",
      rating: "4.8",
      trips: "1,247",
    },
    customer: {
      name: "Lerato Dlamini",
      company: "Sunday Creatives",
      email: "lerato@sundaycreatives.co.za",
      phone: "+27 81 234 5678",
    },
  },
  {
    id: "#55668",
    status: "Pending",
    pickup: {
      name: "Sandton City Depot",
      address: "83 Rivonia Rd, Sandton",
      date: "04 Jan",
      time: "08:15 AM",
    },
    dropoff: {
      name: "Centurion Mall",
      address: "Heuwel Rd, Centurion",
    },
    vehicle: {
      registration: "BT72K1 GP",
      capacity: "1,200 KG",
      breaking: "Yes",
      express: "No",
      flammable: "No",
      trailer: "No",
      time: "08:15 AM",
    },
    driver: {
      name: "Sipho Ndlovu",
      license: "B Code 08",
      phone: "+27 73 890 1234",
      rating: "4.6",
      trips: "892",
    },
    customer: {
      name: "James van der Merwe",
      company: "Sandton Retail Co.",
      email: "james@sandtonretail.co.za",
      phone: "+27 82 345 6789",
    },
  },
  {
    id: "#55669",
    status: "Pending",
    pickup: {
      name: "Cape Town Harbour",
      address: "Duncan Dock, Cape Town",
      date: "04 Jan",
      time: "10:30 AM",
    },
    dropoff: {
      name: "Stellenbosch Farm",
      address: "Baden Powell Dr",
    },
    vehicle: {
      registration: "CA14M5 WC",
      capacity: "2,100 KG",
      breaking: "Yes",
      express: "Yes",
      flammable: "Yes",
      trailer: "Yes",
      time: "10:30 AM",
    },
    driver: {
      name: "Nomsa Phiri",
      license: "C Code 10",
      phone: "+27 79 012 3456",
      rating: "4.9",
      trips: "2,103",
    },
    customer: {
      name: "Maria Botha",
      company: "Winelands Logistics",
      email: "maria@winelands.co.za",
      phone: "+27 76 456 7891",
    },
  },
  {
    id: "#55670",
    status: "In Transit",
    pickup: {
      name: "Durban Point",
      address: " Natal港, Durban",
      date: "03 Jan",
      time: "14:00 PM",
    },
    dropoff: {
      name: "Umlazi Section Q",
      address: "Umlazi, Durban",
    },
    vehicle: {
      registration: "ND88P3 KZN",
      capacity: "650 KG",
      breaking: "Yes",
      express: "Yes",
      flammable: "No",
      trailer: "No",
      time: "14:00 PM",
    },
    driver: {
      name: "Lwazi Khumalo",
      license: "B Code 08",
      phone: "+27 84 567 8901",
      rating: "4.7",
      trips: "634",
    },
    customer: {
      name: "Sibusiso Zulu",
      company: "Durban Fresh Markets",
      email: "sibusiso@durbanfresh.co.za",
      phone: "+27 78 678 9012",
    },
  },
];
