import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import LashaLogo from "@/components/branding/LashaLogo";

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
    <>
      <style>{`
        .lasha-nav-inner {
          width: min(1280px, 100%);
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          padding: 0 18px;
        }
      `}</style>
      {/* Floating glassmorphic pill — detached from the viewport edges, 16px
          inset all round, 22px radius. At rest it sits as a translucent navy
          pill on the hero; on scroll it gains backdrop blur (the glass read)
          plus a soft shadow so it separates from content passing beneath. */}
      <nav
        className="lasha-nav-pill fixed left-0 right-0 z-50"
        style={{ top: 16, paddingLeft: 16, paddingRight: 16 }}
      >
        <div
          className="lasha-nav-inner"
          style={{
            height: 64,
            borderRadius: 22,
            backgroundColor: scrolled ? "rgba(8, 38, 49, 0.72)" : "rgba(8, 38, 49, 0.55)",
            backdropFilter: scrolled ? "blur(18px) saturate(150%)" : "blur(10px) saturate(130%)",
            WebkitBackdropFilter: scrolled ? "blur(18px) saturate(150%)" : "blur(10px) saturate(130%)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            boxShadow: scrolled
              ? "0 12px 32px rgba(4, 20, 26, 0.35)"
              : "0 6px 20px rgba(4, 20, 26, 0.18)",
            transition:
              "background-color 300ms ease, box-shadow 300ms ease, backdrop-filter 300ms ease",
          }}
        >
        {/* Left rail — logo. 1fr on both sides keeps the desktop tabs truly
            centred between the rails regardless of logo/CTA width. */}
        <div style={{ display: "flex", justifyContent: "flex-start", paddingLeft: 10 }}>
          <a href="/" aria-label="Lasha home" style={{ lineHeight: 0 }}>
            <LashaLogo height={30} asset="landing" />
          </a>
        </div>

        {/* Centred desktop links — tabs only, no CTA */}
        <div
          className="hidden lg:flex items-center gap-8"
          style={{ justifySelf: "center" }}
        >
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
        </div>

        {/* Right rail — Login CTA on desktop; mobile toggle on small screens. */}
        <div className="flex items-center justify-end" style={{ paddingRight: 10 }}>
          <a
            href="/auth"
            className="lasha-btn-primary text-[13px] hidden lg:inline-flex"
          >
            Login
          </a>
          <button
            className="lg:hidden bg-transparent border-none text-white cursor-pointer p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
        </div>
      </nav>

      {/* Mobile menu — glass panel matching the pill language */}
      <div
        className="lg:hidden fixed left-0 right-0 z-50 transition-all duration-300"
        style={{
          top: 88,
          paddingLeft: 16,
          paddingRight: 16,
          opacity: mobileOpen ? 1 : 0,
          pointerEvents: mobileOpen ? "auto" : "none",
          transform: mobileOpen ? "translateY(0)" : "translateY(-8px)",
        }}
      >
        <div
          style={{
            borderRadius: 22,
            backgroundColor: "rgba(8, 38, 49, 0.88)",
            backdropFilter: "blur(18px) saturate(150%)",
            WebkitBackdropFilter: "blur(18px) saturate(150%)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            boxShadow: "0 16px 40px rgba(4, 20, 26, 0.4)",
          }}
        >
          <div className="flex flex-col gap-5 px-7 py-7">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => handleNav(link.href)}
                className="text-left text-[17px] font-semibold bg-transparent border-none cursor-pointer"
                style={{ color: "rgba(255,255,255,0.85)" }}
              >
                {link.label}
              </button>
            ))}
            <a href="/auth" className="lasha-btn-primary justify-center text-[15px]">
              Login
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
