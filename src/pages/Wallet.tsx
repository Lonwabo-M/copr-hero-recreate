import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import CustomerShell from "@/components/shells/CustomerShell";
import {
  Wallet as WalletIcon,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  Filter,
  Download,
  CreditCard,
  Building,
  Loader2,
} from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/wallet.css";

export default function Wallet() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");

  const wallet = useQuery(api.users.getWallet);
  const transactions = useQuery(api.users.getTransactions, {});

  const balance = wallet?.balance ?? 0;

  const filteredTransactions = transactions?.filter((t: any) => {
    if (activeFilter === "All") return true;
    if (activeFilter === "Credits") return t.type === "credit";
    if (activeFilter === "Debits") return t.type === "debit";
    return true;
  }) ?? [];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      minimumFractionDigits: 2,
    }).format(amount / 100); // Convert cents to rand
  };

  return (
    <CustomerShell activeItem="Wallet">
      {/* Main content */}
      <main className="wallet-main">
        <div className="wallet-container">
          {/* Header */}
          <div className="wallet-header">
            <h1 className="wallet-title">Wallet</h1>
            <p className="wallet-subtitle">
              Manage your funds, view transactions, and top up your wallet balance.
            </p>
          </div>

          {/* Balance Card */}
          <div className="wallet-balance-card">
            <div className="wallet-balance-content">
              <div className="wallet-balance-info">
                <div className="wallet-balance-icon">
                  <WalletIcon size={24} />
                </div>
                <div>
                  <p className="wallet-balance-label">Available Balance</p>
                  <h2 className="wallet-balance-amount">
                    {wallet === undefined ? (
                      <Loader2 size={20} className="animate-spin" style={{ color: "#999" }} />
                    ) : (
                      formatCurrency(balance)
                    )}
                  </h2>
                </div>
              </div>
              <button
                className="wallet-topup-btn"
                onClick={() => setShowTopUpModal(true)}
              >
                <Plus size={18} />
                Top Up
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="wallet-quick-actions">
            <button className="wallet-quick-action">
              <ArrowUpRight size={18} />
              <span>Send</span>
            </button>
            <button className="wallet-quick-action">
              <ArrowDownLeft size={18} />
              <span>Receive</span>
            </button>
            <button className="wallet-quick-action">
              <Clock size={18} />
              <span>History</span>
            </button>
          </div>

          {/* Transactions */}
          <div className="wallet-transactions-card">
            <div className="wallet-transactions-header">
              <h3>Transactions</h3>
              <div className="wallet-filter-tabs">
                {["All", "Credits", "Debits"].map((f) => (
                  <button
                    key={f}
                    className={`wallet-filter-tab ${activeFilter === f ? "active" : ""}`}
                    onClick={() => setActiveFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="wallet-transactions-list">
              {transactions === undefined ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                  <Loader2 size={20} className="animate-spin" style={{ color: "#999" }} />
                </div>
              ) : filteredTransactions.length === 0 ? (
                <p className="wallet-empty">No transactions yet</p>
              ) : (
                filteredTransactions.map((txn: any) => (
                  <div key={txn._id} className="wallet-transaction-item">
                    <div className="wallet-transaction-left">
                      <div className="wallet-transaction-icon">
                        {txn.type === "credit" ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                      </div>
                      <div>
                        <p className="wallet-transaction-desc">{txn.description}</p>
                        <p className="wallet-transaction-date">
                          {new Date(txn.createdAt).toLocaleString("en-ZA", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="wallet-transaction-right">
                      <p
                        className={`wallet-transaction-amount ${
                          txn.type === "credit" ? "credit" : "debit"
                        }`}
                      >
                        {txn.type === "credit" ? "+" : "-"}
                        {formatCurrency(txn.amount)}
                      </p>
                      <span
                        className={`wallet-transaction-status ${txn.status}`}
                      >
                        {txn.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Top Up Modal (rendered outside the main scroll area) */}
      {showTopUpModal && (
        <div className="wallet-modal-overlay" onClick={() => setShowTopUpModal(false)}>
          <div className="wallet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="wallet-modal-title">Top Up Wallet</h3>
            <p className="wallet-modal-desc">
              Enter the amount you'd like to add to your wallet.
            </p>
            <div className="wallet-modal-input-group">
              <span className="wallet-modal-currency">R</span>
              <input
                type="number"
                className="wallet-modal-input"
                placeholder="0.00"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
              />
            </div>
            <div className="wallet-modal-actions">
              <button
                className="wallet-modal-cancel"
                onClick={() => setShowTopUpModal(false)}
              >
                Cancel
              </button>
              <button
                className="wallet-modal-confirm"
                onClick={() => {
                  // Handle top up - will be implemented with payment integration
                  setShowTopUpModal(false);
                  setTopUpAmount("");
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </CustomerShell>
  );
}
