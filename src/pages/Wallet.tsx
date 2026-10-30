import { useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { useNavigate, useSearchParams } from "react-router";
import { api } from "@/convex/_generated/api";
import CustomerShell from "@/components/shells/CustomerShell";
import {
  Wallet as WalletIcon,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
} from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/wallet.css";

const MIN_TOP_UP_CENTS = 1_000; // R10
const MAX_TOP_UP_CENTS = 5_000_000; // R50,000

export default function Wallet() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeFilter, setActiveFilter] = useState("All");
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [startingTopUp, setStartingTopUp] = useState(false);
  const transactionsRef = useRef<HTMLDivElement>(null);

  const wallet = useQuery(api.users.getWallet);
  const transactions = useQuery(api.users.getTransactions, {});
  const initiateTopUp = useAction(api.payments.walletTopUps.initiateWalletTopUp);
  const verifyTopUp = useAction(api.payments.walletTopUps.verifyWalletTopUp);

  const balance = wallet?.balance ?? 0;
  const reference = searchParams.get("reference");
  const verifyingTopUp = Boolean(reference);

  const filteredTransactions =
    transactions?.filter((t) => {
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
    }).format(amount / 100);
  };

  // Paystack returns here after checkout. The provider status is verified
  // server-side; the browser cannot mark a top-up as paid.
  useEffect(() => {
    if (!reference) return;
    let cancelled = false;

    verifyTopUp({ reference })
      .then((result) => {
        if (cancelled) return;
        if (result.status === "completed") {
          setNotice("Wallet topped up successfully.");
          setTopUpError(null);
          setShowTopUpModal(false);
          setTopUpAmount("");
        } else if (result.status === "failed") {
          setTopUpError("That top-up was not completed. You can try again.");
        } else {
          setNotice(
            "Your top-up is still pending with the provider. This page will update when it completes.",
          );
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setTopUpError(
          e instanceof Error ? e.message : "We couldn't verify that top-up.",
        );
      })
      .finally(() => {
        if (cancelled) return;
        // Remove the reference so a refresh cannot re-run verification.
        searchParams.delete("reference");
        setSearchParams(searchParams, { replace: true });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  const openTopUp = () => {
    setTopUpError(null);
    setNotice(null);
    setShowTopUpModal(true);
  };

  const handleTopUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setTopUpError(null);
    setNotice(null);

    const rands = Number(topUpAmount);
    if (!Number.isFinite(rands) || rands <= 0) {
      setTopUpError("Enter an amount greater than zero.");
      return;
    }

    const amount = Math.round(rands * 100);
    if (amount < MIN_TOP_UP_CENTS) {
      setTopUpError("The minimum top-up is R10.");
      return;
    }
    if (amount > MAX_TOP_UP_CENTS) {
      setTopUpError("The maximum top-up is R50,000.");
      return;
    }

    setStartingTopUp(true);
    try {
      const result = await initiateTopUp({ amount });
      if (result.authorizationUrl) {
        window.location.assign(result.authorizationUrl);
        return;
      }
      setTopUpError("The payment provider did not return a checkout page.");
    } catch (e) {
      setTopUpError(
        e instanceof Error ? e.message : "We couldn't start that top-up.",
      );
    } finally {
      setStartingTopUp(false);
    }
  };

  const showHistory = () => {
    setActiveFilter("All");
    transactionsRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <CustomerShell activeItem="Wallet">
      <main className="wallet-main">
        <div className="wallet-container">
          <div className="wallet-header">
            <h1 className="wallet-title">Wallet</h1>
            <p className="wallet-subtitle">
              Manage your funds, view transactions, and top up your wallet balance.
            </p>
          </div>

          {verifyingTopUp && (
            <div className="wallet-alert wallet-alert-info">
              <Loader2 size={18} className="wallet-spin" />
              <p>Verifying your top-up with the payment provider…</p>
            </div>
          )}
          {notice && (
            <div className="wallet-alert wallet-alert-success">
              <CheckCircle2 size={18} />
              <p>{notice}</p>
              <button
                type="button"
                className="wallet-alert-dismiss"
                aria-label="Dismiss notification"
                onClick={() => setNotice(null)}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {topUpError && !showTopUpModal && (
            <div className="wallet-alert wallet-alert-error">
              <AlertCircle size={18} />
              <p>{topUpError}</p>
              <button
                type="button"
                className="wallet-alert-dismiss"
                aria-label="Dismiss error"
                onClick={() => setTopUpError(null)}
              >
                <X size={15} />
              </button>
            </div>
          )}

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
                      <Loader2
                        size={20}
                        className="wallet-spin"
                        style={{ color: "rgba(255,255,255,0.75)" }}
                      />
                    ) : (
                      formatCurrency(balance)
                    )}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                className="wallet-topup-btn"
                onClick={openTopUp}
              >
                <Plus size={18} />
                Top Up
              </button>
            </div>
          </div>

          <div className="wallet-quick-actions">
            <button type="button" className="wallet-action-card" onClick={openTopUp}>
              <span className="wallet-action-icon">
                <Plus size={20} />
              </span>
              <span className="wallet-action-label">Add money</span>
            </button>
            <button
              type="button"
              className="wallet-action-card"
              onClick={() => navigate("/make-payment")}
            >
              <span className="wallet-action-icon">
                <ArrowUpRight size={20} />
              </span>
              <span className="wallet-action-label">Pay delivery</span>
            </button>
            <button type="button" className="wallet-action-card" onClick={showHistory}>
              <span className="wallet-action-icon">
                <Clock size={20} />
              </span>
              <span className="wallet-action-label">History</span>
            </button>
          </div>

          <div className="wallet-transactions" ref={transactionsRef}>
            <div className="wallet-transactions-header">
              <h3 className="wallet-transactions-title">Transactions</h3>
              <div className="wallet-transactions-filters">
                {["All", "Credits", "Debits"].map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={`wallet-filter ${
                      activeFilter === filter ? "active" : ""
                    }`}
                    onClick={() => setActiveFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <div className="wallet-transactions-list">
              {transactions === undefined ? (
                <div className="wallet-loading">
                  <Loader2 size={20} className="wallet-spin" />
                </div>
              ) : filteredTransactions.length === 0 ? (
                <p className="wallet-empty">
                  {transactions.length === 0
                    ? "No wallet activity yet. Top up or pay for a delivery to see it here."
                    : "No transactions match this filter."}
                </p>
              ) : (
                filteredTransactions.map((txn) => (
                  <div key={txn._id} className="wallet-transaction">
                    <div
                      className={`wallet-transaction-icon ${
                        txn.type === "credit" ? "credit" : "debit"
                      }`}
                    >
                      {txn.type === "credit" ? (
                        <ArrowDownLeft size={18} />
                      ) : (
                        <ArrowUpRight size={18} />
                      )}
                    </div>
                    <div className="wallet-transaction-info">
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

      {showTopUpModal && (
        <div
          className="wallet-modal-overlay"
          onClick={() => {
            if (!startingTopUp) setShowTopUpModal(false);
          }}
        >
          <form
            className="wallet-modal"
            onSubmit={handleTopUp}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="wallet-modal-head">
              <div>
                <h3 className="wallet-modal-title">Top Up Wallet</h3>
                <p className="wallet-modal-desc">
                  Add funds with a card or supported Paystack checkout.
                </p>
              </div>
              <button
                type="button"
                className="wallet-modal-close"
                aria-label="Close top-up"
                onClick={() => setShowTopUpModal(false)}
                disabled={startingTopUp}
              >
                <X size={18} />
              </button>
            </div>

            <label className="wallet-modal-label" htmlFor="wallet-topup-amount">
              Amount
            </label>
            <div className="wallet-modal-input-group">
              <span className="wallet-modal-currency">R</span>
              <input
                id="wallet-topup-amount"
                type="number"
                className="wallet-modal-input"
                placeholder="0.00"
                min={MIN_TOP_UP_CENTS / 100}
                max={MAX_TOP_UP_CENTS / 100}
                step="0.01"
                inputMode="decimal"
                value={topUpAmount}
                onChange={(event) => setTopUpAmount(event.target.value)}
                disabled={startingTopUp}
                autoFocus
              />
            </div>
            <p className="wallet-modal-hint">
              Minimum R10 · Maximum R50,000 per top-up.
            </p>

            {topUpError && (
              <div className="wallet-modal-error">
                <AlertCircle size={15} />
                <span>{topUpError}</span>
              </div>
            )}

            <div className="wallet-modal-actions">
              <button
                type="button"
                className="wallet-modal-cancel"
                onClick={() => setShowTopUpModal(false)}
                disabled={startingTopUp}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="wallet-modal-confirm"
                disabled={startingTopUp}
              >
                {startingTopUp ? (
                  <>
                    <Loader2 size={16} className="wallet-spin" />
                    Starting checkout…
                  </>
                ) : (
                  "Continue to payment"
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </CustomerShell>
  );
}
