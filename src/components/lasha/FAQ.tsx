import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
}

const faqData: FAQItem[] = [
  {
    question: "How quickly can my parcel be delivered?",
    answer:
      "We offer same-day, express, and standard delivery options depending on your location and requirements. Same-day deliveries are available in major metropolitan areas, while express deliveries typically arrive within 24-48 hours.",
  },
  {
    question: "What areas do you cover?",
    answer:
      "Lasha operates across South Africa, with strong coverage in Gauteng, Western Cape, KwaZulu-Natal, and Eastern Cape. We're continuously expanding our reach to serve more communities and businesses nationwide.",
  },
  {
    question: "How do I track my delivery?",
    answer:
      "You can track your delivery in real-time through the Track Delivery section of your dashboard. Simply enter your tracking number to see the current status, location, and estimated arrival time of your parcel.",
  },
  {
    question: "Is there proof of delivery?",
    answer:
      "Yes, every delivery is confirmed with digital proof of delivery. This includes a timestamp, recipient signature or confirmation, and optional photographic evidence to ensure accountability and transparency.",
  },
  {
    question: "What types of parcels can I send?",
    answer:
      "We handle documents, small parcels, large packages, and pallets. Whether it's a single envelope or bulk shipments, our platform accommodates various sizes and weights with appropriate vehicle matching.",
  },
  {
    question: "How do I become a Lasha driver?",
    answer:
      "If you operate a vehicle in South Africa and want to earn by delivering parcels, you can apply through our driver onboarding process. All drivers are vetted, trained, and verified before joining the network.",
  },
];

/**
 * 06 / Field Notes — FAQ.
 *
 * Deliberately inverted against the ivory "04 / Sector Intelligence" section
 * above it: deep navy canvas, light type, cyan accents, hairline separators.
 * The dark block also flows naturally into the navy closing CTA below.
 */
export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section
      id="faq"
      style={{
        backgroundColor: "var(--lasha-navy)",
        padding: "120px 0",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient cyan glow — quiet depth, not decoration */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: -180,
          right: -120,
          width: 520,
          height: 520,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(7,148,181,0.16) 0%, rgba(7,148,181,0) 70%)",
          pointerEvents: "none",
        }}
      />

      <div className="lasha-container" style={{ position: "relative" }}>
        {/* Technical label */}
        <p className="lasha-label mb-6" style={{ color: "var(--lasha-cyan-light)" }}>
          06 / Field Notes
        </p>

        {/* Heading */}
        <h2
          style={{
            fontSize: "clamp(40px, 4.5vw, 68px)",
            lineHeight: 1,
            letterSpacing: "-0.04em",
            fontWeight: 700,
            color: "#ffffff",
            marginBottom: 20,
          }}
        >
          Questions?
          <br />
          <span style={{ color: "var(--lasha-cyan-light)" }}>We&apos;ve got answers.</span>
        </h2>

        {/* Subtitle */}
        <p
          className="lasha-body"
          style={{
            maxWidth: 480,
            fontSize: 17,
            marginBottom: 56,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          Simple explanations to help you get the most out of Lasha deliveries.
        </p>

        {/* FAQ List */}
        <div
          style={{
            maxWidth: 800,
            display: "flex",
            flexDirection: "column",
            borderTop: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {faqData.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.1)",
                  transition: "background 0.25s ease",
                }}
              >
                <button
                  onClick={() => toggle(index)}
                  aria-expanded={isOpen}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "28px 20px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    borderRadius: 12,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "none";
                  }}
                >
                  <span
                    style={{
                      fontSize: 18,
                      fontWeight: 600,
                      color: isOpen ? "#ffffff" : "rgba(255,255,255,0.88)",
                      letterSpacing: "-0.01em",
                      transition: "color 0.2s ease",
                    }}
                  >
                    {item.question}
                  </span>
                  <ChevronDown
                    size={20}
                    style={{
                      color: "var(--lasha-cyan-light)",
                      flexShrink: 0,
                      marginLeft: 16,
                      transition: "transform 0.3s ease",
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  />
                </button>
                <div
                  style={{
                    maxHeight: isOpen ? 220 : 0,
                    overflow: "hidden",
                    transition: "max-height 0.35s ease, padding 0.35s ease",
                    padding: isOpen ? "0 20px 28px" : "0 20px",
                  }}
                >
                  <p
                    style={{
                      fontSize: 15,
                      lineHeight: 1.7,
                      color: "rgba(255,255,255,0.62)",
                      maxWidth: 640,
                    }}
                  >
                    {item.answer}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
