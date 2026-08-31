import { useAuthActions } from "@convex-dev/auth/react";

export function LogoDropdown() {
  const { signOut } = useAuthActions();

  return (
    <div className="relative group">
      <button
        className="flex items-center gap-2 bg-transparent border-none cursor-pointer p-1"
      >
        <span
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: "var(--lasha-navy)",
            letterSpacing: "-0.02em",
          }}
        >
          Lasha
        </span>
      </button>
      <div
        className="absolute right-0 top-full mt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200"
        style={{
          background: "#ffffff",
          border: "1px solid var(--lasha-border-light)",
          borderRadius: 12,
          padding: 8,
          minWidth: 160,
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        }}
      >
        <button
          onClick={() => signOut()}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "8px 12px",
            fontSize: 13,
            color: "var(--lasha-body-text)",
            background: "transparent",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontFamily: "Inter, sans-serif",
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
