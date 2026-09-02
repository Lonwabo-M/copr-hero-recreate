import { UserRound, Menu } from "lucide-react";

interface TopNavigationProps {
  activeLink: string;
  onLinkChange: (link: string) => void;
  onMenuToggle: () => void;
}

const navLinks = ["Home", "About Us", "Services", "Contact US"];

export default function TopNavigation({
  activeLink,
  onLinkChange,
  onMenuToggle,
}: TopNavigationProps) {
  return (
    <header className="dash-topnav">
      {/* Left: Logo */}
      <div className="dash-topnav-logo">
        <button
          className="dash-mobile-toggle"
          onClick={onMenuToggle}
          aria-label="Toggle sidebar"
        >
          <Menu size={22} />
        </button>
        <img
          src="/logo.svg"
          alt="Lasha"
          style={{ height: 28 }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <span className="dash-topnav-logo-text">Lasha</span>
      </div>

      {/* Center: Navigation links */}
      <nav className="dash-topnav-links">
        {navLinks.map((link) => (
          <button
            key={link}
            className={`dash-topnav-link ${activeLink === link ? "active" : ""}`}
            onClick={() => onLinkChange(link)}
          >
            {link}
            {activeLink === link && <span className="dash-topnav-link-underline" />}
          </button>
        ))}
      </nav>

      {/* Right: Profile button */}
      <button className="dash-topnav-profile" aria-label="Profile">
        <UserRound size={22} strokeWidth={1.5} />
      </button>
    </header>
  );
}
