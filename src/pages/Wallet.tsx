import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Sidebar from "@/components/dashboard/Sidebar";
import { useDashboardNav } from "@/hooks/useDashboardNav";
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
  const { handleSidebarNavigation } = useDashboardNav();
  const [activeSidebarItem, setActiveSidebarItem] = useState("Wallet");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");

  const wallet = useQuery(api.users.getWallet);
  const transactions = useQuery(api.users.getTransactions, {});

  const balance = wallet?.balance ?? 0;

  const onSidebarNav = (item: string) => {
    setActiveSidebarItem(item);
    handleSidebarNavigation(item);
  };

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
    <div className="dashboard">
      {/* Top Navigation */}
      <header className="dash-topnav">
        <div className="dash-topnav-logo">
          <div className="lasha-logo-icon">
            <span>L</span>
          </div>
          <span className="dash-topnav-logo-text">Lasha</span>
        </div>

        <div className="dash-topnav-links">
          <button className="dash-topnav-link active">
            Home
            <span className="dash-topnav-link-underline" />
          </button>
          <button className="dash-topnav-link">About Us</button>
          <button className="dash-topnav-link">Services</button>
          <button className="dash-topnav-link">Contact US</button>
        </div>

        <div className="dash-topnav-right">
          <button
            className="dash-mobile-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <button className="dash-topnav-profile">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
        </div>
      </header>

      {/* App body */}
      <div className="dash-app">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="dash-mobile-overlay visible"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <Sidebar
          activeItem={activeSidebarItem}
          onItemChange={onSidebarNav}
          isOpen={sidebarOpen}
        />

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
              <button className="wallet-action-card">
                <div className="wallet-action-icon">
                  <CreditCard size={20} />
                </div>
                <span className="wallet-action-label">Add Funds</span>
              </button>
              <button className="wallet-action-card">
                <div className="wallet-action-icon">
                  <ArrowUpRight size={20} />
                </div>
                <span className="wallet-action-label">Send Money</span>
              </button>
              <button className="wallet-action-card">
                <div className="wallet-action-icon">
                  <Building size={20} />
                </div>
                <span className="wallet-action-label">Bank Transfer</span>
              </button>
              <button className="wallet-action-card">
                <div className="wallet-action-icon">
                  <Download size={20} />
                </div>
                <span className="wallet-action-label">Export Statement</span>
              </button>
            </div>

            {/* Transactions Section */}
            <div className="wallet-transactions">
              <div className="wallet-transactions-header">
                <h3 className="wallet-transactions-title">Transaction History</h3>
                <div className="wallet-transactions-filters">
                  {["All", "Credits", "Debits"].map((filter) => (
                    <button
                      key={filter}
                      className={`wallet-filter ${activeFilter === filter ? "active" : ""}`}
                      onClick={() => setActiveFilter(filter)}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transactions List */}
              <div className="wallet-transactions-list">
                {transactions === undefined ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                    <Loader2 size={20} className="animate-spin" style={{ color: "#999" }} />
                  </div>
                ) : filteredTransactions.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
                    <p>No transactions yet</p>
                  </div>
                ) : (
                  filteredTransactions.map((txn: any) => (
                    <div key={txn._id} className="wallet-transaction">
                      <div className="wallet-transaction-icon">
                        {txn.type === "credit" ? (
                          <ArrowDownLeft size={18} className="text-emerald-500" />
                        ) : (
                          <ArrowUpRight size={18} className="text-red-500" />
                        )}
                      </div>
                      <div className="wallet-transaction-info">
                        <p className="wallet-transaction-desc">{txn.description}</p>
                        <p className="wallet-transaction-date">
                          {new Date(txn.createdAt).toLocaleDateString("en-ZA", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                          {txn.reference && (
                            <span className="wallet-transaction-ref">{txn.reference}</span>
                          )}
                        </p>
                      </div>
                      <div className="wallet-transaction-amounts">
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
      </div>

      {/* Top Up Modal */}
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
    </div>
  );
}
