import { useState, useEffect } from "react";
import Landing from "./components/Landing.jsx";
import AuthPage from "./components/AuthPage.jsx";

const CloudIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
  </svg>
);

const MonitorIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <path d="M8 21h8M12 17v4"/>
    <polyline points="7 13 10 10 13 12 16 8"/>
  </svg>
);

const BillingIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2"/>
    <path d="M2 10h20"/>
    <path d="M6 15h.01M10 15h4"/>
  </svg>
);

const ArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
  </svg>
);

const AccountIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
  </svg>
);

const hubCss = `
.hub-page { min-height: 100vh; background: var(--bg); display: flex; flex-direction: column; }
.hub-header { background: var(--white); border-bottom: 1px solid var(--border); }
.hub-header-inner { max-width: 1200px; margin: 0 auto; padding: 0 32px; height: 68px; display: flex; align-items: center; justify-content: space-between; }
.hub-logo { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: var(--text); display: flex; align-items: center; gap: 3px; }
.hub-logo-icon { width: 32px; height: 32px; background: var(--blue-600); border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-right: 10px; }
.hub-logo span { color: var(--blue-600); }
.hub-user-row { display: flex; align-items: center; gap: 16px; }
.hub-avatar { width: 38px; height: 38px; border-radius: 10px; background: linear-gradient(135deg, #2563eb, #6366f1); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px; color: #fff; flex-shrink: 0; }
.hub-user-info { display: flex; flex-direction: column; }
.hub-user-name { font-size: 14px; font-weight: 600; color: var(--text); line-height: 1.3; }
.hub-user-email { font-size: 12px; color: var(--text-muted); }
.hub-main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 64px 32px; }
.hub-welcome { text-align: center; margin-bottom: 52px; }
.hub-welcome h1 { font-size: 38px; font-weight: 800; letter-spacing: -1.2px; color: var(--text); margin-bottom: 10px; }
.hub-welcome p { font-size: 16px; color: var(--text-secondary); }
.hub-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; width: 100%; max-width: 860px; }
.hub-img-card { position: relative; border-radius: 18px; overflow: hidden; cursor: pointer; animation: solFloat 5s ease-in-out infinite; box-shadow: 0 16px 48px rgba(37,99,235,0.14), 0 4px 12px rgba(0,0,0,0.08); background: #f0f4ff; }
.hub-img-card:nth-child(2) { animation-delay: 1.2s; }
.hub-img-card img { width: 100%; height: auto; display: block; transition: transform 0.4s ease; object-fit: contain; }
.hub-img-card:hover img { transform: scale(1.025); }
.hub-img-fade { position: absolute; bottom: 0; left: 0; right: 0; height: 50%; background: linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.97) 80%, #fff 100%); pointer-events: none; }
.hub-img-cta { position: absolute; bottom: 20px; left: 24px; display: inline-flex; align-items: center; gap: 10px; background: #2563eb; color: #fff; font-size: 14px; font-weight: 700; font-family: inherit; padding: 12px 22px; border-radius: 10px; border: none; cursor: pointer; z-index: 3; box-shadow: 0 4px 16px rgba(37,99,235,0.35); transition: background 0.2s, transform 0.2s; }
.hub-img-cta:hover { background: #1d4ed8; transform: translateY(-2px); }
@media (max-width: 640px) {
  .hub-cards { grid-template-columns: 1fr; max-width: 420px; }
  .hub-header-inner { padding: 0 20px; }
  .hub-user-info { display: none; }
  .hub-main { padding: 40px 20px; }
  .hub-welcome h1 { font-size: 28px; }
  .hub-card { padding: 28px 24px; }
}
`;

export default function App() {
  const [page, setPage] = useState("home");
  const [user, setUser] = useState(null);

  const SESSION_TTL = 2 * 24 * 60 * 60 * 1000; // 2 days in ms

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("cn_user"));
      if (s && s.loginTime && (Date.now() - s.loginTime) < SESSION_TTL) {
        setUser(s);
        setPage("hub");
      } else {
        localStorage.removeItem("cn_user");
      }
    } catch {}
  }, []);

  function handleLogin(userData) {
    const sessionData = { ...userData, loginTime: Date.now() };
    localStorage.setItem("cn_user", JSON.stringify(sessionData));
    setUser(sessionData);
    setPage("hub");
  }

  function logout() {
    localStorage.removeItem("cn_user");
    setUser(null);
    setPage("home");
  }

  /* ── HUB ── */
  if (page === "hub" && user) {
    const firstName = user.name.split(" ")[0];

    return (
      <>
        <style>{hubCss}</style>
        <div className="hub-page">

          <header className="hub-header">
            <div className="hub-header-inner">
              <div className="hub-logo">
                <div className="hub-logo-icon"><CloudIcon /></div>
                Cloud<span>Nexus</span>
              </div>
              <div className="hub-user-row">
                <div className="hub-avatar"><AccountIcon /></div>
                <div className="hub-user-info">
                  <span className="hub-user-name">{user.name}</span>
                  <span className="hub-user-email">{user.email}</span>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={logout}>Sign out</button>
              </div>
            </div>
          </header>

          <main className="hub-main">
            <div className="hub-welcome">
              <h1>Welcome back, {firstName}</h1>
              <p>Select a product to continue</p>
            </div>

            <div className="hub-cards">
              <div className="hub-img-card" onClick={() => window.open("http://localhost:3007", "_blank")}>
                <img src="/images/card-monitoring.png" alt="Monitoring" />
                <div className="hub-img-fade" />
                <button className="hub-img-cta">
                  Go to Monitoring <ArrowRight />
                </button>
              </div>

              <div className="hub-img-card" onClick={() => window.open("http://localhost:3008", "_blank")}>
                <img src="/images/card-billing.png" alt="Billing" />
                <div className="hub-img-fade" />
                <button className="hub-img-cta">
                  Go to Billing <ArrowRight />
                </button>
              </div>
            </div>
          </main>

        </div>
      </>
    );
  }

  /* ── AUTH ── */
  if (page === "auth") {
    return <AuthPage onLogin={handleLogin} onBack={() => setPage("home")} />;
  }

  /* ── HOME ── */
  return <Landing onNavigate={setPage} />;
}
