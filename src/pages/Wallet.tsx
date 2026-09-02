import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import Sidebar from "@/components/dashboard/Sidebar";
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
} from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/wallet.css";

interface Transaction {
  id: string;
  type: "credit" | "debit";
  amount: number;
  description: string;
  date: string;
  status: "completed" | "pending" | "failed";
  reference?: string;
}

const transactions: Transaction[] = [
  {
    id: "TXN001",
    type: "credit",
    amount: 5000,
    description: "Wallet Top-Up",
    date: "2026-09-01",
    status: "completed",
    reference: "TOP-20260901-001",
  },
  {
    id: "TXN002",
    type: "debit",
    amount: 450,
    description: "Delivery #ORD-55667",
    date: "2026-08-31",
    status: "completed",
    reference: "DEL-20260831-042",
  },
  {
    id: "TXN003",
    type: "debit",
    amount: 320,
    description: "Delivery #ORD-55666",
    date: "2026-08-30",
    status: "completed",
    reference: "DEL-20260830-038",
  },
  {
    id: "TXN004",
    type: "credit",
    amount: 2000,
    description: "Refund - Delivery #ORD-55660",
    date: "2026-08-29",
    status: "completed",
    reference: "REF-20260829-015",
  },
  {
    id: "TXN005",
    type: "debit",
    amount: 780,
    description: "Delivery #ORD-55665",
    date: "2026-08-28",
    status: "pending",
    reference: "DEL-20260828-031",
  },
  {
    id: "TXN006",
    type: "credit",
    amount: 10000,
    description: "Business Account Top-Up",
    date: "2026-08-27",
    status: "completed",
    reference: "TOP-20260827-008",
  },
];

export default function Wallet() {
  const { signOut } = useAuthActions();
  const [activeSidebarItem, setActiveSidebarItem] = useState("Wallet");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");

  const balance = 15450;

  const handleSidebarNavigation = (item: string) => {
    setActiveSidebarItem(item);
    const routes: Record<string, string> = {
      "Activity Center": "/dashboard",
      "Past Deliveries": "/past-deliveries",
      "Request Delivery": "/request-delivery",
      "Track Delivery": "/track-delivery",
      Invoices: "/invoices",
      Wallet: "/wallet",
      "Make Payment": "/make-payment",
      Notifications: "/notifications",
      Help: "/help",
      Legal: "/legal",
      Downloads: "/downloads",
      Settings: "/settings",
    };
    if (item === "Log out") {
      sessionStorage.removeItem("lasha_guest");
      signOut();
      return;
    }
    const route = routes[item];
    if (route) window.location.href = route;
  };

  const filteredTransactions = transactions.filter((t) => {
    if (activeFilter === "All") return true;
    if (activeFilter === "Credits") return t.type === "credit";
    if (activeFilter === "Debits") return t.type === "debit";
    return true;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      minimumFractionDigits: 2,
    }).format(amount);
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
          onItemChange={handleSidebarNavigation}
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
                    <h2 className="wallet-balance-amount">{formatCurrency(balance)}</h2>
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
                {filteredTransactions.map((txn) => (
                  <div key={txn.id} className="wallet-transaction">
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
                        {new Date(txn.date).toLocaleDateString("en-ZA", {
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
                ))}
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
                  // Handle top up
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
