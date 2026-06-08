import { useState, useEffect, useRef } from "react";
import { MenuBar } from "./MenuBar";

const CloudIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
);
const ArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
);
const ChevronLeft = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
);
const ChevronRight = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
);
const XIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);

const monitoringCards = [
  { image: "/images/monitoring_health.png", title: "Server Health Dashboard", desc: "Real-time CPU, memory, and disk monitoring across all your servers with automated health checks and instant anomaly detection." },
  { image: "/images/monitoring_network.png", title: "Network Traffic Analytics", desc: "Visualize bandwidth consumption, request rates, and latency metrics with geographic traffic mapping across all regions." },
  { image: "/images/monitoring_performance.png", title: "Application Performance", desc: "Track response times, throughput, and error rates with service dependency mapping and bottleneck identification." },
  { image: "/images/monitoring_alerts.png", title: "Alert Management", desc: "Configure intelligent alerting with severity levels, escalation policies, and incident timelines for rapid response." },
];

const billingCards = [
  { image: "/images/billing_overview.png", title: "Cost Overview Dashboard", desc: "Comprehensive monthly cost breakdown with spending trends, budget utilization tracking, and invoice summaries at a glance." },
  { image: "/images/billing_usage.png", title: "Usage Breakdown", desc: "Detailed resource usage analysis by service — compute, storage, and networking costs broken down per team and project." },
  { image: "/images/billing_invoices.png", title: "Invoice Management", desc: "Manage all invoices with payment status tracking, one-click downloads, and complete billing history in one place." },
  { image: "/images/billing_forecast.png", title: "Budget Forecasting", desc: "AI-powered cost projections with confidence bands, budget vs. actual comparisons, and proactive savings recommendations." },
];

/* ── Carousel Component ── */
function Carousel({ cards, onClose, title }) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(null);
  const total = cards.length;

  function goNext() {
    if (current < total - 1) { setDirection("right"); setCurrent(c => c + 1); }
  }
  function goPrev() {
    if (current > 0) { setDirection("left"); setCurrent(c => c - 1); }
  }

  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  return (
    <div className="carousel-overlay" onClick={onClose}>
      <div className="carousel-container" onClick={e => e.stopPropagation()}>
        <div className="carousel-header">
          <div>
            <h3 className="carousel-title">{title}</h3>
            <span className="carousel-counter">{current + 1} of {total}</span>
          </div>
          <button className="carousel-close" onClick={onClose}><XIcon /></button>
        </div>
        <div className="carousel-body">
          <button className="carousel-arrow carousel-arrow-left" onClick={goPrev} disabled={current === 0}>
            <ChevronLeft />
          </button>
          <div className="carousel-card-wrapper">
            <div className="carousel-card" key={current}>
              <div className="carousel-image-wrap">
                <img src={cards[current].image} alt={cards[current].title} className="carousel-image" />
              </div>
              <div className="carousel-info">
                <h4>{cards[current].title}</h4>
                <p>{cards[current].desc}</p>
              </div>
            </div>
          </div>
          <button className="carousel-arrow carousel-arrow-right" onClick={goNext} disabled={current === total - 1}>
            <ChevronRight />
          </button>
        </div>
        <div className="carousel-dots">
          {cards.map((_, i) => (
            <button key={i} className={`carousel-dot ${i === current ? "active" : ""}`} onClick={() => setCurrent(i)} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Nav menu items ── */
const makeNavItems = (onNavigate) => [
  {
    label: "Monitoring",
    onClick: () => document.getElementById("solutions")?.scrollIntoView({ behavior: "smooth" }),
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
      </svg>
    ),
  },
  {
    label: "Billing",
    onClick: () => document.getElementById("solutions")?.scrollIntoView({ behavior: "smooth" }),
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 0 1 0 4H8"/><path d="M12 18V6"/>
      </svg>
    ),
  },
  {
    label: "Solutions",
    onClick: () => document.getElementById("solutions")?.scrollIntoView({ behavior: "smooth" }),
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
  {
    label: "Dashboard",
    onClick: () => window.scrollTo({ top: 0, behavior: "smooth" }),
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
    ),
  },
  {
    label: "Alerts",
    onClick: () => document.getElementById("solutions")?.scrollIntoView({ behavior: "smooth" }),
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
      </svg>
    ),
  },
  {
    label: "Let's Talk",
    onClick: () => onNavigate("auth"),
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
];

/* ── Landing Page ── */
export default function Landing({ onNavigate }) {
  const [scrolled, setScrolled] = useState(false);
  const [activeCarousel, setActiveCarousel] = useState(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (activeCarousel) { document.body.style.overflow = "hidden"; }
    else { document.body.style.overflow = ""; }
    return () => { document.body.style.overflow = ""; };
  }, [activeCarousel]);

  return (
    <>
      {/* Navbar */}
      <nav className={`navbar ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-container">
          <div className="logo">
            <div className="logo-icon"><CloudIcon /></div>
            Cloud<span>Nexus</span>
          </div>
          <div className="nav-links">
            <a href="#solutions">Features</a>
            <a href="#solutions">Solutions</a>
          </div>
          <div className="nav-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate("auth")}>Sign in</button>
            <button className="btn btn-primary btn-sm" onClick={() => onNavigate("auth")}>Get Started <ArrowRight /></button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="hero-container">
          <div className="hero-content">
            <div className="hero-badge">
              <span className="hero-badge-dot" />
              Now with multi-cloud AI forecasting
            </div>
            <h1>Reduce cloud costs.<br /><span className="highlight">Maximize</span> performance.</h1>
            <p className="hero-desc">
              CloudNexus gives engineering teams complete visibility into cloud infrastructure usage, costs, and performance — all from one unified dashboard.
            </p>
            <div className="hero-actions">
              <button className="btn btn-primary btn-xl" onClick={() => onNavigate("auth")}>Start Free Trial</button>
              <button className="btn btn-secondary btn-xl">Book a Demo</button>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hm-scene">
              {/* Laptop */}
              <div className="hm-laptop">
                <div className="hm-lid">
                  <div className="hm-screen-display">
                    <div className="hm-nav">
                      <div className="hm-logo">
                        <div className="hm-logo-dot" />
                        Cloud<span>Nexus</span>
                      </div>
                      <div className="hm-nav-links"><span>Monitor</span><span>Billing</span></div>
                    </div>
                    <div className="hm-dash">
                      <div className="hm-dash-row">
                        <div className="hm-ds"><div className="hm-ds-l">CPU</div><div className="hm-ds-v">68%</div></div>
                        <div className="hm-ds"><div className="hm-ds-l">RAM</div><div className="hm-ds-v">4.2GB</div></div>
                        <div className="hm-ds ok"><div className="hm-ds-l">Status</div><div className="hm-ds-v">OK</div></div>
                      </div>
                      <div className="hm-chart">
                        {[30,55,40,70,45,80,55,75,60,85,70,90].map((h,i) => (
                          <div key={i} className="hm-bar" style={{height:`${h}%`}} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="hm-base"><div className="hm-keys" /><div className="hm-trackpad" /></div>
              </div>

              {/* Panel 1 – Server Health */}
              <div className="hm-panel hm-p1">
                <div className="hm-panel-bar">
                  <div className="hm-dots"><i /><i /><i /></div>
                  <span>Server Health</span><span className="hm-ptag">Monitoring</span>
                </div>
                <div className="hm-panel-body">
                  {[['CPU Usage','68%',68],['Memory','54%',54],['Network','82%',82]].map(([l,v,w]) => (
                    <div key={l} className="hm-metric">
                      <div className="hm-ml">{l}</div>
                      <div className="hm-mbar"><div className="hm-mfill" style={{width:`${w}%`}} /></div>
                      <div className="hm-mv">{v}</div>
                    </div>
                  ))}
                  <div className="hm-status-row"><div className="hm-ad hm-green" /><span>All systems go</span></div>
                </div>
              </div>

              {/* Panel 2 – Cost Analytics */}
              <div className="hm-panel hm-p2">
                <div className="hm-panel-bar">
                  <div className="hm-dots"><i /><i /><i /></div>
                  <span>Cost Analytics</span><span className="hm-ptag">Billing</span>
                </div>
                <div className="hm-panel-body hm-cost-body">
                  <div className="hm-cost-info">
                    <div className="hm-cl">Monthly Spend</div>
                    <div className="hm-cv">$12.4K</div>
                    <div className="hm-cc">↓ 8.2% savings</div>
                  </div>
                  <div className="hm-mini-chart">
                    {[40,60,45,70,55,80,65].map((h,i) => (
                      <div key={i} className="hm-mini-bar" style={{height:`${h}%`}} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Panel 3 – Alert Monitor */}
              <div className="hm-panel hm-p3">
                <div className="hm-panel-bar">
                  <div className="hm-dots"><i /><i /><i /></div>
                  <span>Alert Monitor</span><span className="hm-ptag">Status</span>
                </div>
                <div className="hm-panel-body">
                  <div className="hm-alert"><div className="hm-ad hm-green" /><span>All systems operational</span></div>
                  <div className="hm-alert"><div className="hm-ad hm-yellow" /><span>2 warnings detected</span></div>
                  <div className="hm-alert"><div className="hm-ad hm-grey" /><span>0 critical alerts</span></div>
                  <div className="hm-time">Last checked: 2 min ago</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Two Solution Cards: Monitoring & Billing */}
      <section className="solutions-section" id="solutions">
        <div className="section-container">
          <div className="section-header">
            <div className="section-eyebrow">Our Solutions</div>
            <h2 className="section-title">Two powerful platforms,<br />one unified experience</h2>
            <p className="section-desc">Click on either solution to explore detailed features and capabilities.</p>
          </div>
          <div className="solution-cards">
            {/* Monitoring Card — image */}
            <div className="sol-img-card" onClick={() => setActiveCarousel("monitoring")}>
              <img src="/images/card-monitoring.png" alt="Monitoring" className="sol-img" />
            </div>

            {/* Billing Card — image */}
            <div className="sol-img-card" onClick={() => setActiveCarousel("billing")}>
              <img src="/images/card-billing.png" alt="Billing" className="sol-img" />
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="section-container">
          <div className="cta-card">
            <h2>Ready to optimize your cloud?</h2>
            <p>Join 2,000+ teams already saving an average of 35% on their cloud infrastructure costs.</p>
            <div className="cta-actions">
              <button className="btn btn-primary btn-xl" onClick={() => onNavigate("auth")}>Start Free Trial</button>
              <button className="btn btn-secondary btn-xl">Talk to Sales</button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-container">
          <div className="footer-top">
            <div className="logo" style={{ fontSize: 18 }}>
              <div className="logo-icon" style={{ width: 28, height: 28 }}><CloudIcon /></div>
              Cloud<span>Nexus</span>
            </div>
            <div className="footer-links">
              <a href="#features">Features</a><a href="#solutions">Solutions</a><a href="#">Careers</a><a href="#">Contact</a>
            </div>
          </div>
          <div className="footer-bottom">
            <span className="footer-copy">© 2026 CloudNexus. All rights reserved.</span>
            <div className="footer-links">
              <a href="#">Privacy</a><a href="#">Terms</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Carousel Overlay */}
      {activeCarousel === "monitoring" && (
        <Carousel cards={monitoringCards} title="Monitoring Features" onClose={() => setActiveCarousel(null)} />
      )}
      {activeCarousel === "billing" && (
        <Carousel cards={billingCards} title="Billing Features" onClose={() => setActiveCarousel(null)} />
      )}
    </>
  );
}
