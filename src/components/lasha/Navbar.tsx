import { useState, useEffect } from "react";
import { Menu, X, ArrowRight } from "lucide-react";

const navLinks = [
  { label: "Why Lasha", href: "#why-lasha" },
  { label: "Who We Serve", href: "#who-we-serve" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "About", href: "#about" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const handleNav = (href: string) => {
    setMobileOpen(false);
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "shadow-lg" : ""
      }`}
      style={{ backgroundColor: "var(--lasha-navy)", height: 76 }}
    >
      <div className="lasha-container flex items-center justify-between h-full">
        {/* Logo + tagline */}
        <a href="/" className="flex items-center gap-3 no-underline">
          <span
            className="text-white font-extrabold text-xl tracking-tight"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Lasha
          </span>
          <span
            className="hidden sm:block text-[10px] font-medium tracking-[0.20em] uppercase"
            style={{ color: "rgba(255,255,255,0.35)", borderLeft: "1px solid rgba(255,255,255,0.15)", paddingLeft: 12 }}
          >
            Logistics Infrastructure
          </span>
        </a>

        {/* Desktop links */}
        <div className="hidden lg:flex items-center gap-8">
          {navLinks.map((link) => (
            <button
              key={link.href}
              onClick={() => handleNav(link.href)}
              className="text-[13px] font-semibold tracking-wide bg-transparent border-none cursor-pointer transition-colors duration-200"
              style={{ color: "rgba(255,255,255,0.72)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#ffffff")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.72)")}
            >
              {link.label}
            </button>
          ))}
          <button
            onClick={() => handleNav("#how-it-works")}
            className="text-[13px] font-semibold tracking-wide bg-transparent border-none cursor-pointer transition-colors duration-200"
            style={{ color: "var(--lasha-cyan)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--lasha-cyan-light)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--lasha-cyan)")}
          >
            Track Shipment
          </button>
          <a href="/auth" className="lasha-btn-primary text-[13px]">
            Get Started
            <ArrowRight size={14} />
          </a>
        </div>

        {/* Mobile toggle */}
        <button
          className="lg:hidden bg-transparent border-none text-white cursor-pointer p-2"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      <div
        className="lg:hidden fixed inset-0 transition-all duration-300"
        style={{
          top: 76,
          backgroundColor: "var(--lasha-navy)",
          opacity: mobileOpen ? 1 : 0,
          pointerEvents: mobileOpen ? "auto" : "none",
        }}
      >
        <div className="lasha-container flex flex-col gap-6 pt-10">
          {navLinks.map((link) => (
            <button
              key={link.href}
              onClick={() => handleNav(link.href)}
              className="text-left text-[18px] font-semibold bg-transparent border-none cursor-pointer"
              style={{ color: "rgba(255,255,255,0.85)" }}
            >
              {link.label}
            </button>
          ))}
          <button
            onClick={() => handleNav("#how-it-works")}
            className="text-left text-[18px] font-semibold bg-transparent border-none cursor-pointer"
            style={{ color: "var(--lasha-cyan)" }}
          >
            Track Shipment
          </button>
          <a href="/auth" className="lasha-btn-primary mt-4 justify-center text-[15px]">
            Get Started
            <ArrowRight size={16} />
          </a>
        </div>
      </div>
    </nav>
  );
}
