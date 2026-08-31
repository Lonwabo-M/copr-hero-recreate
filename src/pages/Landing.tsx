import { motion } from "framer-motion";
import {
  ArrowRight,
  Building2,
  Clock,
  Globe,
  MapPin,
  Package,
  Phone,
  Shield,
  Truck,
  Zap,
  Star,
  CheckCircle2,
} from "lucide-react";
import { Link } from "react-router";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const },
  }),
};

const features = [
  {
    icon: Truck,
    title: "Same-Day Delivery",
    description:
      "Get packages delivered within hours, not days. Our logistics network ensures your shipments arrive on time, every time.",
  },
  {
    icon: Building2,
    title: "B2B & B2C Solutions",
    description:
      "Whether you are a business shipping to customers or managing inter-company logistics, Lasha handles it all from one platform.",
  },
  {
    icon: MapPin,
    title: "Real-Time Tracking",
    description:
      "Watch your deliveries move across the city in real time. Share live ETAs with your customers so they always know when to expect their packages.",
  },
  {
    icon: Shield,
    title: "Secure & Insured",
    description:
      "Every shipment is fully insured and handled with care. Our verification system ensures only trusted couriers access your packages.",
  },
  {
    icon: Zap,
    title: "Instant Pricing",
    description:
      "Get transparent, upfront quotes in seconds. No hidden fees, no surprises — just straightforward pricing for every route.",
  },
  {
    icon: Globe,
    title: "Wide Coverage",
    description:
      "Serve customers across every neighborhood. Our network of professional couriers covers the entire metropolitan area and beyond.",
  },
];

const steps = [
  {
    number: "01",
    title: "Create an Account",
    description:
      "Sign up in under a minute. Choose a business or personal account and you are ready to start sending.",
  },
  {
    number: "02",
    title: "Schedule a Pickup",
    description:
      "Enter your pickup and drop-off details, choose a time window, and confirm your order. We handle the rest.",
  },
  {
    number: "03",
    title: "Track & Deliver",
    description:
      "Monitor your delivery in real time from dispatch to doorstep. Your customers get live updates every step of the way.",
  },
];

const stats = [
  { value: "50K+", label: "Deliveries Completed" },
  { value: "98%", label: "On-Time Rate" },
  { value: "4.9", label: "Average Rating" },
  { value: "24/7", label: "Support Available" },
];

const testimonials = [
  {
    name: "Sarah Mitchell",
    role: "Operations Manager, FreshCart",
    quote:
      "Lasha cut our delivery costs by 30% while improving customer satisfaction. The real-time tracking alone was worth the switch.",
  },
  {
    name: "David Chen",
    role: "Founder, UrbanGoods",
    quote:
      "We went from handling deliveries ourselves to fully automating everything through Lasha. It scaled with us from 50 to 500 orders a week.",
  },
  {
    name: "Amara Obi",
    role: "Logistics Lead, MedSupply Co.",
    quote:
      "Reliable, fast, and professional. Lasha is the only platform we trust for time-sensitive medical supply deliveries.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-sm tracking-tight">
              L
            </div>
            <span className="text-xl font-bold tracking-tight">Lasha</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">
              How It Works
            </a>
            <a href="#pricing" className="hover:text-foreground transition-colors">
              Pricing
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/auth">
              <button className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-4 py-2 cursor-pointer">
                Log In
              </button>
            </Link>
            <Link to="/auth">
              <button className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer">
                Get Started Free
              </button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative px-6 pt-20 pb-28 md:pt-28 md:pb-36">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full bg-primary/[0.03] blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary"
            >
              <Zap className="size-3.5" />
              Now serving businesses across all major cities
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-5xl font-bold tracking-tight leading-[1.1] sm:text-6xl md:text-7xl"
            >
              Delivery that{" "}
              <span className="text-primary">moves your business</span>{" "}
              forward
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-7 text-lg leading-relaxed text-muted-foreground max-w-2xl mx-auto"
            >
              Lasha connects businesses and customers with reliable, fast delivery
              at transparent prices. From local shops to enterprise logistics — one
              platform to manage it all.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Link to="/auth">
                <button className="group rounded-xl bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-primary/20">
                  Start Delivering
                  <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </Link>
              <a href="#how-it-works">
                <button className="rounded-xl border border-border bg-background px-7 py-3.5 text-sm font-semibold hover:bg-accent transition-colors cursor-pointer">
                  See How It Works
                </button>
              </a>
            </motion.div>
          </div>

          {/* Hero Visual — Delivery Map Illustration */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-16 mx-auto max-w-4xl"
          >
            <div className="relative rounded-2xl border border-border/60 bg-card p-1 shadow-2xl shadow-primary/5">
              <div className="rounded-xl bg-muted/50 p-6 md:p-8">
                {/* Dashboard Preview Mockup */}
                <div className="flex items-center gap-2 mb-6">
                  <div className="size-2.5 rounded-full bg-destructive/60" />
                  <div className="size-2.5 rounded-full bg-yellow-500/60" />
                  <div className="size-2.5 rounded-full bg-green-500/60" />
                  <span className="ml-3 text-xs text-muted-foreground font-medium">
                    app.lasha.io/dashboard
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Active Deliveries Card */}
                  <div className="rounded-xl bg-background border border-border/60 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Truck className="size-4 text-primary" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Active Deliveries
                      </span>
                    </div>
                    <div className="text-3xl font-bold">24</div>
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600 font-medium">
                      <CheckCircle2 className="size-3" />
                      12 arriving soon
                    </div>
                    <div className="mt-4 space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2">
                          <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center">
                            <Package className="size-3.5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">
                              Order #{1000 + i * 127}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {["3.2 km away", "Arriving now", "1.8 km away"][i - 1]}
                            </div>
                          </div>
                          <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            {["In Transit", "Nearby", "In Transit"][i - 1]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Revenue Card */}
                  <div className="rounded-xl bg-background border border-border/60 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="size-4 text-primary" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Today's Revenue
                      </span>
                    </div>
                    <div className="text-3xl font-bold">$2,847</div>
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600 font-medium">
                      <CheckCircle2 className="size-3" />
                      +18% vs yesterday
                    </div>
                    <div className="mt-4 h-24 flex items-end gap-1.5 px-1">
                      {[40, 55, 35, 70, 60, 85, 75, 90, 65, 80, 95, 72].map(
                        (h, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-t-sm bg-primary/20 hover:bg-primary/40 transition-colors"
                            style={{ height: `${h}%` }}
                          />
                        )
                      )}
                    </div>
                    <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground px-1">
                      <span>6am</span>
                      <span>Noon</span>
                      <span>Now</span>
                    </div>
                  </div>

                  {/* Map Preview Card */}
                  <div className="rounded-xl bg-background border border-border/60 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <MapPin className="size-4 text-primary" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Live Tracking
                      </span>
                    </div>
                    <div className="relative h-[140px] rounded-lg bg-muted/80 overflow-hidden">
                      {/* Stylized map lines */}
                      <svg
                        viewBox="0 0 200 140"
                        className="absolute inset-0 size-full"
                        fill="none"
                      >
                        <path
                          d="M10 120 Q60 80 100 60 T190 20"
                          stroke="oklch(0.37 0.12 165 / 0.15)"
                          strokeWidth="2"
                          strokeDasharray="4 4"
                        />
                        <path
                          d="M20 100 Q80 60 140 40 T180 30"
                          stroke="oklch(0.37 0.12 165 / 0.08)"
                          strokeWidth="1.5"
                        />
                        <path
                          d="M0 90 Q50 70 100 50 T200 10"
                          stroke="oklch(0.37 0.12 165 / 0.05)"
                          strokeWidth="1"
                        />
                        {/* Route line */}
                        <path
                          d="M30 110 Q70 75 120 55 Q150 42 180 30"
                          stroke="oklch(0.37 0.12 165 / 0.6)"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                        {/* Courier dot */}
                        <circle cx="120" cy="55" r="6" fill="oklch(0.37 0.12 165)" />
                        <circle cx="120" cy="55" r="10" fill="oklch(0.37 0.12 165 / 0.15)" />
                        {/* Destination */}
                        <circle cx="180" cy="30" r="4" fill="oklch(0.577 0.245 27.325)" />
                        <circle cx="180" cy="30" r="7" fill="oklch(0.577 0.245 27.325 / 0.15)" />
                        {/* Origin */}
                        <circle cx="30" cy="110" r="4" fill="oklch(0.37 0.12 165 / 0.4)" />
                      </svg>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-medium">Order #1087</div>
                        <div className="text-[10px] text-muted-foreground">
                          ETA: 8 minutes
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-green-700 bg-green-500/10 px-2 py-0.5 rounded-full">
                        On Time
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-border/50 bg-muted/30">
        <div className="mx-auto max-w-7xl px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="text-center"
            >
              <div className="text-3xl font-bold text-primary">{stat.value}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-sm font-semibold text-primary uppercase tracking-wider mb-3"
            >
              Everything You Need
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.05 }}
              className="text-3xl md:text-4xl font-bold tracking-tight"
            >
              Built for businesses that move fast
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="mt-4 text-muted-foreground leading-relaxed"
            >
              From instant quotes to real-time tracking, Lasha gives you the tools
              to run world-class delivery operations without the overhead.
            </motion.p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="group rounded-2xl border border-border/60 bg-card p-7 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
              >
                <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                  <feature.icon className="size-5" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section
        id="how-it-works"
        className="py-24 px-6 bg-muted/30 border-y border-border/50"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-sm font-semibold text-primary uppercase tracking-wider mb-3"
            >
              Simple Process
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.05 }}
              className="text-3xl md:text-4xl font-bold tracking-tight"
            >
              Up and running in minutes
            </motion.h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <motion.div
                key={step.number}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="relative"
              >
                <div className="text-6xl font-bold text-primary/10 mb-4">
                  {step.number}
                </div>
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 -right-4 w-8 border-t border-dashed border-primary/20" />
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 px-6">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-sm font-semibold text-primary uppercase tracking-wider mb-3"
            >
              Trusted by Businesses
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.05 }}
              className="text-3xl md:text-4xl font-bold tracking-tight"
            >
              Loved by companies of all sizes
            </motion.h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div
                key={t.name}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="rounded-2xl border border-border/60 bg-card p-7"
              >
                <div className="flex items-center gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star
                      key={j}
                      className="size-4 fill-yellow-500 text-yellow-500"
                    />
                  ))}
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground mb-6">
                  "{t.quote}"
                </p>
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-3xl bg-primary p-12 md:p-16 text-center text-primary-foreground relative overflow-hidden"
          >
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-white/5 blur-2xl" />
            </div>
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
                Ready to transform your delivery operations?
              </h2>
              <p className="mt-4 text-base text-primary-foreground/80 max-w-xl mx-auto">
                Join thousands of businesses that trust Lasha for fast, reliable,
                and transparent delivery. Get started with no commitment.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link to="/auth">
                  <button className="rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-primary hover:bg-white/90 transition-colors cursor-pointer flex items-center gap-2">
                    Create Free Account
                    <ArrowRight className="size-4" />
                  </button>
                </Link>
                <a href="tel:+18005551234">
                  <button className="rounded-xl border border-white/30 px-7 py-3.5 text-sm font-semibold hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-2">
                    <Phone className="size-4" />
                    Talk to Sales
                  </button>
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-muted/30">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs">
                L
              </div>
              <span className="text-lg font-bold tracking-tight">Lasha</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#features" className="hover:text-foreground transition-colors">
                Features
              </a>
              <a href="#how-it-works" className="hover:text-foreground transition-colors">
                How It Works
              </a>
              <a href="#" className="hover:text-foreground transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-foreground transition-colors">
                Terms
              </a>
            </div>
            <div className="text-sm text-muted-foreground">
              © 2026 Lasha. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
