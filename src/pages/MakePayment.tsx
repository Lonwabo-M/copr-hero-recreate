import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { CreditCard, Wallet, Building2, Smartphone } from "lucide-react";
import "@/styles/pages.css";

export default function MakePayment() {
  const [method, setMethod] = useState("card");
  const [amount, setAmount] = useState("");

  const methods = [
    { id: "card", label: "Credit / Debit Card", icon: CreditCard },
    { id: "eft", label: "EFT Bank Transfer", icon: Building2 },
    { id: "wallet", label: "Lasha Wallet", icon: Wallet },
    { id: "snapscan", label: "SnapScan", icon: Smartphone },
  ];

  return (
    <DashboardLayout activeSidebarItem="Make Payment">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">Make a Payment</h1>
          <p className="page-subtitle">Pay for deliveries, top up your wallet, or settle invoices</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, maxWidth: 700 }}>
          {/* Payment method selection */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#202020", display: "block", marginBottom: 10 }}>
              Payment Method
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {methods.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "16px 18px",
                      borderRadius: 10,
                      border: `1px solid ${method === m.id ? "#42b4d0" : "#e8e8e8"}`,
                      background: method === m.id ? "#f0fbfd" : "#fff",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s",
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: method === m.id ? "#42b4d0" : "#f4f4f4",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: method === m.id ? "#fff" : "#666",
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={20} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500, color: method === m.id ? "#0794b5" : "#202020" }}>
                      {m.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#202020", display: "block", marginBottom: 8 }}>
              Amount (ZAR)
            </label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 16, fontWeight: 600, color: "#999" }}>
                R
              </span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                style={{
                  width: "100%",
                  padding: "14px 16px 14px 36px",
                  borderRadius: 10,
                  border: "1px solid #e8e8e8",
                  fontSize: 16,
                  fontWeight: 600,
                  color: "#202020",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Reference */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#202020", display: "block", marginBottom: 8 }}>
              Reference (optional)
            </label>
            <input
              type="text"
              placeholder="Invoice number or description"
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 10,
                border: "1px solid #e8e8e8",
                fontSize: 14,
                color: "#202020",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Submit */}
          <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
            <button
              style={{
                width: "100%",
                padding: "14px 24px",
                borderRadius: 10,
                border: "none",
                background: "#42b4d0",
                color: "#fff",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.15s",
              }}
            >
              Confirm Payment
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
