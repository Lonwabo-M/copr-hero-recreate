/**
 * Customer Address Book
 *
 * The saved pickup and drop-off locations behind the suggestions on Request
 * Delivery. Customers add, rename, re-label, delete and choose a default here;
 * every write goes through the user-scoped Convex mutations.
 */

import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  BookUser,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import CustomerShell from "@/components/shells/CustomerShell";
import type { SavedAddress } from "@/lib/address";
import "@/styles/dashboard.css";
import "@/styles/pages.css";
import "@/styles/address-book.css";

interface AddressForm {
  label: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  isDefault: boolean;
}

const EMPTY_FORM: AddressForm = {
  label: "",
  street: "",
  city: "",
  state: "",
  zip: "",
  isDefault: false,
};

export default function AddressBook() {
  const addresses = useQuery(api.addresses.listMyAddresses);
  const createAddress = useMutation(api.addresses.createAddress);
  const updateAddress = useMutation(api.addresses.updateAddress);
  const deleteAddress = useMutation(api.addresses.deleteAddress);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"addresses"> | null>(null);
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const list = (addresses ?? []) as SavedAddress[];

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function startAdd() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, isDefault: list.length === 0 });
    setError(null);
    setFormOpen(true);
  }

  function startEdit(address: SavedAddress) {
    setEditingId(address._id as Id<"addresses">);
    setForm({
      label: address.label,
      street: address.street,
      city: address.city,
      state: address.state,
      zip: address.zip,
      isDefault: address.isDefault,
    });
    setError(null);
    setFormOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!form.label.trim()) {
      setError("Give this address a short name, like Home or Office.");
      return;
    }
    if (!form.street.trim()) {
      setError("Enter the street address.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateAddress({
          addressId: editingId,
          label: form.label.trim(),
          street: form.street.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          zip: form.zip.trim(),
          isDefault: form.isDefault,
        });
      } else {
        await createAddress({
          label: form.label.trim(),
          street: form.street.trim(),
          city: form.city.trim() || undefined,
          state: form.state.trim() || undefined,
          zip: form.zip.trim() || undefined,
          isDefault: form.isDefault,
        });
      }
      closeForm();
    } catch {
      setError("We couldn't save this address. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function makeDefault(addressId: string) {
    setError(null);
    setPendingId(addressId);
    try {
      await updateAddress({
        addressId: addressId as Id<"addresses">,
        isDefault: true,
      });
    } catch {
      setError("We couldn't update the default address. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  async function remove(addressId: string) {
    setPendingId(addressId);
    setError(null);
    try {
      await deleteAddress({ addressId: addressId as Id<"addresses"> });
      setConfirmDelete(null);
      if (editingId === addressId) closeForm();
    } catch {
      setError("We couldn't delete this address. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <CustomerShell activeItem="Address Book">
      <div className="dash-workspace" style={{ overflow: "auto" }}>
        <div className="page-container address-book-page">
          <div className="address-book-header">
            <div>
              <h1 className="page-title">Address Book</h1>
              <p className="page-subtitle">
                Save the places you collect from and deliver to. They appear as
                suggestions when you request a delivery.
              </p>
            </div>
            {!formOpen && (
              <button type="button" className="address-add-btn" onClick={startAdd}>
                <Plus size={16} /> Add address
              </button>
            )}
          </div>

          {error && (
            <div className="address-alert" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button type="button" aria-label="Dismiss" onClick={() => setError(null)}>
                <X size={15} />
              </button>
            </div>
          )}

          {formOpen && (
            <form className="address-form-card" onSubmit={handleSubmit}>
              <div className="address-form-title">
                <h2>{editingId ? "Edit address" : "New address"}</h2>
                <button type="button" aria-label="Close form" onClick={closeForm}>
                  <X size={18} />
                </button>
              </div>

              <div className="address-form-grid">
                <div className="address-form-field">
                  <label htmlFor="address-label">Label</label>
                  <input
                    id="address-label"
                    placeholder="Home, Office, Warehouse"
                    maxLength={40}
                    value={form.label}
                    onChange={(event) => setForm({ ...form, label: event.target.value })}
                  />
                </div>

                <div className="address-form-field address-form-field--wide">
                  <label htmlFor="address-street">Street address</label>
                  <input
                    id="address-street"
                    placeholder="12 Main Road, Bellville"
                    maxLength={200}
                    value={form.street}
                    onChange={(event) => setForm({ ...form, street: event.target.value })}
                  />
                </div>

                <div className="address-form-field">
                  <label htmlFor="address-city">City / suburb</label>
                  <input
                    id="address-city"
                    placeholder="Cape Town"
                    maxLength={80}
                    value={form.city}
                    onChange={(event) => setForm({ ...form, city: event.target.value })}
                  />
                </div>

                <div className="address-form-field">
                  <label htmlFor="address-state">Province</label>
                  <input
                    id="address-state"
                    placeholder="Western Cape"
                    maxLength={80}
                    value={form.state}
                    onChange={(event) => setForm({ ...form, state: event.target.value })}
                  />
                </div>

                <div className="address-form-field">
                  <label htmlFor="address-zip">Postal code</label>
                  <input
                    id="address-zip"
                    placeholder="7530"
                    maxLength={12}
                    value={form.zip}
                    onChange={(event) => setForm({ ...form, zip: event.target.value })}
                  />
                </div>

                <label className="address-default-check">
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={(event) => setForm({ ...form, isDefault: event.target.checked })}
                  />
                  Use as my default address
                </label>
              </div>

              <div className="address-form-actions">
                <button type="button" className="address-btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" className="address-btn-primary" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 size={15} className="address-spin" /> Saving…
                    </>
                  ) : editingId ? (
                    "Save changes"
                  ) : (
                    "Save address"
                  )}
                </button>
              </div>
            </form>
          )}

          {addresses === undefined ? (
            <div className="address-loading">
              <Loader2 size={22} className="address-spin" />
            </div>
          ) : list.length === 0 ? (
            <div className="empty-state address-empty" style={{ minHeight: "45vh" }}>
              <div className="empty-state-icon">
                <BookUser size={24} />
              </div>
              <div className="empty-state-title">Your address book is empty</div>
              <div className="empty-state-desc">
                Save a pickup or drop-off point and it will be ready to select
                the next time you request a delivery.
              </div>
              <button type="button" className="address-add-btn" onClick={startAdd}>
                <Plus size={16} /> Add your first address
              </button>
            </div>
          ) : (
            <div className="address-grid">
              {list.map((address) => {
                const isPending = pendingId === address._id;
                const secondary = [address.city, address.state, address.zip]
                  .map((part) => part.trim())
                  .filter(Boolean)
                  .join(", ");
                return (
                  <article className="address-card" key={address._id}>
                    <div className="address-card-top">
                      <span className="address-card-icon">
                        <MapPin size={18} />
                      </span>
                      <div className="address-card-body">
                        <div className="address-card-label">
                          {address.label}
                          {address.isDefault && (
                            <span className="address-default-badge">Default</span>
                          )}
                        </div>
                        <p className="address-card-street">{address.street}</p>
                        {secondary && <p className="address-card-city">{secondary}</p>}
                      </div>
                    </div>

                    <div className="address-card-actions">
                      {!address.isDefault && (
                        <button
                          type="button"
                          className="address-action"
                          onClick={() => void makeDefault(address._id)}
                          disabled={isPending}
                        >
                          <Star size={14} /> Set as default
                        </button>
                      )}
                      <button
                        type="button"
                        className="address-action"
                        onClick={() => startEdit(address)}
                      >
                        <Pencil size={14} /> Edit
                      </button>

                      {confirmDelete === address._id ? (
                        <span className="address-confirm-delete">
                          <span>Delete?</span>
                          <button
                            type="button"
                            className="address-action address-action--danger"
                            onClick={() => void remove(address._id)}
                            disabled={isPending}
                          >
                            Yes, delete
                          </button>
                          <button
                            type="button"
                            className="address-action"
                            onClick={() => setConfirmDelete(null)}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="address-action address-action--danger"
                          onClick={() => setConfirmDelete(address._id)}
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <p className="address-book-hint">
            Need to send a parcel now?{" "}
            <Link to="/request-delivery">Request a delivery</Link>
          </p>
        </div>
      </div>
    </CustomerShell>
  );
}
