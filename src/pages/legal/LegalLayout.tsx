import { Link, useLocation } from "react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import LashaLogo from "@/components/branding/LashaLogo";
import { LEGAL_DOCUMENTS, PRIVACY_CONTACT } from "@/lib/legal";

/**
 * Public legal document shell.
 *
 * Legal notices must be readable without an account — they are the "notice at
 * collection" POPIA s18 requires, and they are linked from every form. This is
 * therefore a self-contained public page (its own masthead, no app shell and
 * no RoleGate), visually part of the landing page family.
 */

export interface LegalSection {
  id: string;
  label: string;
}

interface LegalLayoutProps {
  title: string;
  subtitle: string;
  /** Shown in the metadata strip, e.g. "26 October 2026". */
  effectiveDate?: string;
  version?: string;
  sections?: LegalSection[];
  children: React.ReactNode;
  /** Optional callout rendered under the masthead (e.g. "how to request access"). */
  highlight?: React.ReactNode;
}

export default function LegalLayout({
  title,
  subtitle,
  effectiveDate,
  version,
  sections,
  children,
  highlight,
}: LegalLayoutProps) {
  const location = useLocation();

  return (
    <div className="legal-page">
      <header className="legal-masthead">
        <div className="legal-masthead-inner">
          <Link to="/" className="legal-brand" aria-label="Lasha home">
            <LashaLogo height={28} asset="landing" />
          </Link>
          <nav className="legal-doc-nav" aria-label="Legal documents">
            {LEGAL_DOCUMENTS.map((doc) => (
              <Link
                key={doc.path}
                to={doc.path}
                className={location.pathname === doc.path ? "is-active" : undefined}
                aria-current={location.pathname === doc.path ? "page" : undefined}
              >
                {doc.short}
              </Link>
            ))}
          </nav>
          <Link to="/" className="legal-back">
            <ArrowLeft size={14} /> Back to Lasha
          </Link>
        </div>
      </header>

      <section className="legal-hero">
        <div className="legal-hero-inner">
          <p className="legal-eyebrow">
            <ShieldCheck size={13} /> Legal &amp; privacy
          </p>
          <h1>{title}</h1>
          <p className="legal-lede">{subtitle}</p>
          <dl className="legal-meta">
            {effectiveDate ? (
              <div>
                <dt>Effective</dt>
                <dd>{effectiveDate}</dd>
              </div>
            ) : null}
            {version ? (
              <div>
                <dt>Version</dt>
                <dd>{version}</dd>
              </div>
            ) : null}
            <div>
              <dt>Privacy desk</dt>
              <dd>
                <a href={`mailto:${PRIVACY_CONTACT.email}`}>{PRIVACY_CONTACT.email}</a>
              </dd>
            </div>
            <div>
              <dt>Applies to</dt>
              <dd>lasha.co.za and the Lasha platform</dd>
            </div>
          </dl>
        </div>
      </section>

      <main className="legal-body">
        <div className={`legal-grid${sections?.length ? "" : " legal-grid-single"}`}>
          {sections?.length ? (
            <aside className="legal-toc" aria-label="On this page">
              <p className="legal-toc-title">On this page</p>
              <ol>
                {sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`}>{section.label}</a>
                  </li>
                ))}
              </ol>
              <div className="legal-toc-help">
                <p>Questions about your information?</p>
                <a href={`mailto:${PRIVACY_CONTACT.email}`}>{PRIVACY_CONTACT.email}</a>
                <Link to="/privacy-rights">Exercise your rights →</Link>
              </div>
            </aside>
          ) : null}

          <article className="legal-paper">
            {highlight ? <div className="legal-highlight">{highlight}</div> : null}
            <div className="legal-prose">{children}</div>
            <footer className="legal-paper-footer">
              <p>
                This document forms part of Lasha&apos;s POPIA (Act 4 of 2013)
                transparency obligations. If anything here is unclear, contact
                our Information Officer at{" "}
                <a href={`mailto:${PRIVACY_CONTACT.email}`}>{PRIVACY_CONTACT.email}</a>.
              </p>
              <div className="legal-paper-links">
                {LEGAL_DOCUMENTS.filter((doc) => doc.path !== location.pathname).map((doc) => (
                  <Link key={doc.path} to={doc.path}>
                    {doc.label}
                  </Link>
                ))}
              </div>
            </footer>
          </article>
        </div>
      </main>

      <style>{`
        .legal-page {
          min-height: 100vh;
          background: var(--lasha-ivory);
          color: var(--lasha-navy);
          font-family: Inter, system-ui, -apple-system, sans-serif;
        }
        .legal-masthead {
          border-bottom: 1px solid var(--lasha-border-light);
          background: rgba(244, 242, 233, 0.92);
          backdrop-filter: blur(12px);
          position: sticky;
          top: 0;
          z-index: 20;
        }
        .legal-masthead-inner {
          max-width: 1180px;
          margin: 0 auto;
          padding: 14px 24px;
          display: flex;
          align-items: center;
          gap: 24px;
        }
        .legal-brand { display: flex; align-items: center; text-decoration: none; }
        .legal-doc-nav {
          display: flex;
          gap: 18px;
          margin-left: auto;
          flex-wrap: wrap;
          font-size: 13px;
        }
        .legal-doc-nav a {
          color: var(--lasha-muted);
          text-decoration: none;
          font-weight: 500;
          padding-bottom: 2px;
          border-bottom: 1px solid transparent;
          transition: color 0.15s, border-color 0.15s;
        }
        .legal-doc-nav a:hover { color: var(--lasha-navy); }
        .legal-doc-nav a.is-active {
          color: var(--lasha-navy);
          border-color: var(--lasha-lime-ink);
          font-weight: 600;
        }
        .legal-back {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12.5px;
          font-weight: 600;
          color: var(--lasha-cyan);
          text-decoration: none;
          white-space: nowrap;
        }
        .legal-hero {
          background: var(--lasha-navy);
          color: var(--lasha-ivory);
          padding: 56px 24px 96px;
        }
        .legal-hero-inner { max-width: 1180px; margin: 0 auto; }
        .legal-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--lasha-lime);
          margin-bottom: 18px;
        }
        .legal-hero h1 {
          font-size: clamp(32px, 4.4vw, 52px);
          line-height: 1.05;
          letter-spacing: -0.035em;
          font-weight: 700;
          margin: 0 0 16px;
          max-width: 18ch;
        }
        .legal-lede {
          max-width: 62ch;
          font-size: 15.5px;
          line-height: 1.6;
          color: rgba(244, 242, 233, 0.72);
        }
        .legal-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px 40px;
          margin-top: 34px;
          padding-top: 22px;
          border-top: 1px solid rgba(255, 255, 255, 0.12);
        }
        .legal-meta dt {
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(244, 242, 233, 0.45);
          margin-bottom: 4px;
        }
        .legal-meta dd { font-size: 13px; color: var(--lasha-ivory); margin: 0; }
        .legal-meta a { color: var(--lasha-cyan-light); text-decoration: none; }
        .legal-body {
          max-width: 1180px;
          margin: -64px auto 0;
          padding: 0 24px 96px;
        }
        .legal-grid {
          display: grid;
          grid-template-columns: 230px minmax(0, 1fr);
          gap: 40px;
          align-items: start;
        }
        .legal-grid-single { grid-template-columns: minmax(0, 1fr); max-width: 860px; margin: 0 auto; }
        .legal-toc {
          position: sticky;
          top: 88px;
          background: #ffffff;
          border: 1px solid var(--lasha-border-light);
          border-radius: 16px;
          padding: 20px 18px;
        }
        .legal-toc-title {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--lasha-muted);
          margin-bottom: 12px;
        }
        .legal-toc ol { list-style: none; margin: 0; padding: 0; counter-reset: toc; }
        .legal-toc li { counter-increment: toc; margin-bottom: 7px; }
        .legal-toc li a {
          font-size: 12.5px;
          line-height: 1.35;
          color: rgba(8, 38, 49, 0.72);
          text-decoration: none;
        }
        .legal-toc li a::before {
          content: counter(toc, decimal-leading-zero) "  ";
          color: var(--lasha-muted);
          font-size: 10px;
          font-variant-numeric: tabular-nums;
        }
        .legal-toc li a:hover { color: var(--lasha-cyan); }
        .legal-toc-help {
          margin-top: 18px;
          padding-top: 16px;
          border-top: 1px solid var(--lasha-border-light);
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
        }
        .legal-toc-help p { color: var(--lasha-muted); margin: 0; }
        .legal-toc-help a { color: var(--lasha-cyan); text-decoration: none; font-weight: 600; }
        .legal-paper {
          background: #ffffff;
          border: 1px solid var(--lasha-border-light);
          border-radius: 20px;
          padding: clamp(28px, 4vw, 56px);
          box-shadow: 0 24px 60px -40px rgba(8, 38, 49, 0.35);
        }
        .legal-highlight {
          background: rgba(229, 243, 74, 0.22);
          border: 1px solid rgba(100, 114, 8, 0.25);
          border-radius: 12px;
          padding: 16px 18px;
          font-size: 13.5px;
          line-height: 1.6;
          margin-bottom: 32px;
        }
        .legal-highlight a { color: var(--lasha-lime-ink); font-weight: 600; }
        .legal-prose { font-size: 14.5px; line-height: 1.75; color: rgba(8, 38, 49, 0.85); }
        .legal-prose h2 {
          font-size: 21px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--lasha-navy);
          margin: 44px 0 12px;
          padding-top: 8px;
          scroll-margin-top: 92px;
        }
        .legal-prose h2:first-child { margin-top: 0; }
        .legal-prose h3 {
          font-size: 15px;
          font-weight: 700;
          margin: 26px 0 8px;
          color: var(--lasha-navy);
        }
        .legal-prose p { margin: 0 0 14px; }
        .legal-prose ul, .legal-prose ol { margin: 0 0 16px; padding-left: 22px; }
        .legal-prose li { margin-bottom: 7px; }
        .legal-prose a { color: var(--lasha-cyan); font-weight: 500; }
        .legal-prose strong { color: var(--lasha-navy); }
        .legal-prose table {
          width: 100%;
          border-collapse: collapse;
          margin: 8px 0 22px;
          font-size: 13px;
          line-height: 1.5;
        }
        .legal-prose th, .legal-prose td {
          text-align: left;
          vertical-align: top;
          padding: 9px 12px;
          border-bottom: 1px solid var(--lasha-border-light);
        }
        .legal-prose th {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--lasha-muted);
          background: rgba(8, 38, 49, 0.03);
        }
        .legal-prose code {
          font-family: "SF Mono", Menlo, monospace;
          font-size: 12.5px;
          background: rgba(8, 38, 49, 0.05);
          padding: 1px 5px;
          border-radius: 4px;
        }
        .legal-paper-footer {
          margin-top: 44px;
          padding-top: 20px;
          border-top: 1px solid var(--lasha-border-light);
          font-size: 12.5px;
          line-height: 1.65;
          color: var(--lasha-muted);
        }
        .legal-paper-links {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          margin-top: 14px;
        }
        .legal-paper-links a { color: var(--lasha-cyan); text-decoration: none; font-weight: 600; }
        @media (max-width: 900px) {
          .legal-grid { grid-template-columns: minmax(0, 1fr); gap: 0; }
          .legal-toc { display: none; }
          .legal-doc-nav { display: none; }
          .legal-hero { padding-bottom: 80px; }
        }
        @media (max-width: 560px) {
          .legal-back { font-size: 0; gap: 0; }
        }
      `}</style>
    </div>
  );
}
