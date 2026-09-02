import Navbar from "@/components/lasha/Navbar";
import Hero from "@/components/lasha/Hero";
import WhyLasha from "@/components/lasha/WhyLasha";
import WhoWeServe from "@/components/lasha/WhoWeServe";
import HowItWorks from "@/components/lasha/HowItWorks";
import About from "@/components/lasha/About";
import SectorIntelligence from "@/components/lasha/SectorIntelligence";
import FAQ from "@/components/lasha/FAQ";
import FinalCTA from "@/components/lasha/FinalCTA";
import Footer from "@/components/lasha/Footer";

export default function Landing() {
  return (
    <div
      style={{
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        backgroundColor: "var(--lasha-ivory)",
        minHeight: "100vh",
      }}
    >
      <Navbar />
      <Hero />
      <WhyLasha />
      <WhoWeServe />
      <HowItWorks />
      <About />
      <SectorIntelligence />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}
