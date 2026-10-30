/**
 * Address field with saved-address suggestions.
 *
 * Typing shows matching locations from the customer's address book; the whole
 * list appears on focus. A line that isn't saved yet can be added to the book
 * inline, with a short label, without leaving the delivery form.
 *
 * The field only owns the address text — geocoding still happens on submit,
 * so a selected suggestion follows exactly the same verification path as a
 * typed address.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { BookmarkPlus, Check, MapPinned, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { formatSavedAddress, type SavedAddress } from "@/lib/address";
import "@/styles/address-book.css";

interface AddressFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  icon: LucideIcon;
  required?: boolean;
}

export default function AddressField({
  label,
  value,
  onChange,
  placeholder,
  icon: Icon,
  required = false,
}: AddressFieldProps) {
  const addresses = useQuery(api.addresses.listMyAddresses);
  const createAddress = useMutation(api.addresses.createAddress);

  const [open, setOpen] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setShowSave(false);
        setSaveError(null);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const query = value.trim().toLowerCase();
  const matches = useMemo(() => {
    const list = (addresses ?? []) as SavedAddress[];
    const tokens = query.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return list;
    return list.filter((address) => {
      const haystack = [address.label, address.street, address.city, address.state, address.zip]
        .join(" ")
        .toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [addresses, query]);

  const typed = value.trim();
  const alreadySaved = (addresses ?? []).some(
    (address) => formatSavedAddress(address as SavedAddress).toLowerCase() === typed.toLowerCase(),
  );
  const canSave = typed.length >= 4 && !alreadySaved;
  const showMenu = open && (addresses !== undefined || canSave);

  function flashSaved(message: string) {
    setSavedNote(message);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setSavedNote(null), 4000);
  }

  async function handleSave() {
    if (!canSave || saving) return;
    const name = labelDraft.trim();
    if (!name) {
      setSaveError("Give this address a short name, like Home or Office.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const result = await createAddress({
        label: name,
        street: typed,
        city: "",
        zip: "",
      });
      setShowSave(false);
      setLabelDraft("");
      setOpen(false);
      flashSaved(
        result.created
          ? "Saved to your address book"
          : "This address is already in your address book",
      );
    } catch {
      setSaveError("We couldn't save this address. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="form-field address-field" ref={rootRef}>
      <label className="form-label">
        {label} {required && <span className="required">*</span>}
      </label>

      <div className="form-input-wrapper">
        <Icon className="form-input-icon location-icon" size={18} />
        <input
          type="text"
          className="form-input address-input"
          placeholder={placeholder}
          value={value}
          autoComplete="off"
          role="combobox"
          aria-expanded={showMenu}
          aria-controls="address-field-menu"
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setShowSave(false);
            setSaveError(null);
          }}
          onFocus={() => setOpen(true)}
          onPaste={(event) => {
            const pasted = event.clipboardData?.getData("text") ?? "";
            if (!pasted) return;

            // Native paste has been unreliable in this form; update the
            // controlled value explicitly and keep the saved-address menu in
            // sync with the pasted text.
            event.preventDefault();
            const input = event.currentTarget;
            const start = input.selectionStart ?? value.length;
            const end = input.selectionEnd ?? value.length;
            const normalized = pasted.replace(/\s*\n+\s*/g, " ");
            onChange(
              value.slice(0, start) + normalized + value.slice(end),
            );
            setOpen(true);
            setShowSave(false);
            setSaveError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setShowSave(false);
            }
          }}
        />
        {value && (
          <button
            type="button"
            className="address-clear"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={() => {
              onChange("");
              setOpen(true);
              setShowSave(false);
            }}
          >
            <X size={15} />
          </button>
        )}
      </div>

      {showMenu && (
        <div className="address-menu" id="address-field-menu" role="listbox" aria-label="Saved addresses">
          {matches.length > 0 && (
            <p className="address-menu-heading">Saved addresses</p>
          )}

          {matches.slice(0, 6).map((address) => (
            <button
              key={address._id}
              type="button"
              role="option"
              aria-selected={false}
              className="address-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(formatSavedAddress(address));
                setOpen(false);
                setShowSave(false);
              }}
            >
              <span className="address-option-icon">
                <MapPinned size={16} />
              </span>
              <span className="address-option-text">
                <span className="address-option-label">
                  {address.label}
                  {address.isDefault && <span className="address-default-pill">Default</span>}
                </span>
                <span className="address-option-street">{formatSavedAddress(address)}</span>
              </span>
            </button>
          ))}

          {matches.length === 0 && !canSave && !showSave && (
            <p className="address-menu-empty">No saved addresses yet.</p>
          )}

          {showSave ? (
            <div className="address-save-panel">
              <label className="address-save-label" htmlFor={`address-save-${label}`}>
                Name this address
              </label>
              <div className="address-save-row">
                <input
                  id={`address-save-${label}`}
                  className="address-save-input"
                  placeholder="e.g. Home, Office, Warehouse"
                  value={labelDraft}
                  maxLength={40}
                  autoFocus
                  onChange={(event) => setLabelDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleSave();
                    }
                    if (event.key === "Escape") {
                      setShowSave(false);
                      setSaveError(null);
                    }
                  }}
                />
                <button
                  type="button"
                  className="address-save-btn"
                  onClick={() => void handleSave()}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
              {saveError && <p className="address-save-error">{saveError}</p>}
            </div>
          ) : canSave ? (
            <button
              type="button"
              className="address-save-trigger"
              onClick={() => {
                setShowSave(true);
                setSaveError(null);
              }}
            >
              <BookmarkPlus size={16} />
              Save this address to your book
            </button>
          ) : null}

          <div className="address-menu-footer">
            <Link to="/address-book">Manage address book</Link>
          </div>
        </div>
      )}

      {savedNote && (
        <p className="address-saved-note">
          <Check size={13} /> {savedNote}
        </p>
      )}
    </div>
  );
}
