/** A location saved in the customer's address book. */
export interface SavedAddress {
  _id: string;
  label: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  isDefault: boolean;
}

/** Single-line display form: "12 Main Road, Paarl, Western Cape, 7646". */
export function formatSavedAddress(address: SavedAddress): string {
  return [address.street, address.city, address.state, address.zip]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}
