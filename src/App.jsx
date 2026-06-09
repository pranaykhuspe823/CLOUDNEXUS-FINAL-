import { useState, useEffect } from "react";
import Landing from "./components/Landing.jsx";
import AuthPage from "./components/AuthPage.jsx";
import AdminPortal from "./components/AdminPortal.jsx";

/* ── Activity tracking (shared localStorage key with AdminPortal) ── */
const ACTIVITY_KEY = "cn_user_activity";

function _readActivity() {
  try { return JSON.parse(localStorage.getItem(ACTIVITY_KEY) || "{}"); } catch { return {}; }
}
function _writeActivity(data) {
  try { localStorage.setItem(ACTIVITY_KEY, JSON.stringify(data)); } catch {}
}
function recordLogin(email) {
  const data = _readActivity();
  data[email] = {
    ...(data[email] || {}),
    lastLogin:    Date.now(),
    sessionStart: Date.now(),
    lastSeen:     Date.now(),
    lastLogout:   null,
    lastSessionDuration: null,
    totalSessions: ((data[email]?.totalSessions) || 0) + 1,
  };
  _writeActivity(data);
}
function recordLogout(email, sessionStart) {
  const data     = _readActivity();
  const duration = sessionStart ? Date.now() - sessionStart : 0;
  data[email] = {
    ...(data[email] || {}),
    lastLogout:          Date.now(),
    lastSeen:            Date.now(),
    lastSessionDuration: duration,
  };
  _writeActivity(data);
}
function updateLastSeen(email) {
  const data = _readActivity();
  if (data[email]) { data[email].lastSeen = Date.now(); _writeActivity(data); }
}

const CloudIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
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

const LockIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
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
.hub-avatar { width: 38px; height: 38px; border-radius: 10px; background: linear-gradient(135deg, #2563eb, #6366f1); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px; color: #fff; flex-shrink: 0; overflow: hidden; }
.hub-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.hub-avatar-wrap { position: relative; width: 38px; height: 38px; flex-shrink: 0; cursor: pointer; }
.hub-avatar-wrap:hover .hub-avatar-overlay { opacity: 1; }
.hub-avatar-overlay { position: absolute; inset: 0; border-radius: 10px; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.18s; pointer-events: none; }
.hub-avatar-input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
.hub-user-info { display: flex; flex-direction: column; }
.hub-user-name { font-size: 14px; font-weight: 600; color: var(--text); line-height: 1.3; }
.hub-user-email { font-size: 12px; color: var(--text-muted); }
.hub-main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 64px 32px; }
.hub-welcome { text-align: center; margin-bottom: 52px; }
.hub-welcome h1 { font-size: 38px; font-weight: 800; letter-spacing: -1.2px; color: var(--text); margin-bottom: 10px; }
.hub-welcome p { font-size: 16px; color: var(--text-secondary); }
.hub-cards { display: grid; gap: 24px; width: 100%; max-width: 860px; }
.hub-cards.two-col { grid-template-columns: 1fr 1fr; }
.hub-cards.one-col { grid-template-columns: 1fr; max-width: 440px; }
.hub-img-card { position: relative; border-radius: 18px; overflow: hidden; cursor: pointer; animation: solFloat 5s ease-in-out infinite; box-shadow: 0 16px 48px rgba(37,99,235,0.14), 0 4px 12px rgba(0,0,0,0.08); background: #f0f4ff; }
.hub-img-card:nth-child(2) { animation-delay: 1.2s; }
.hub-img-card img { width: 100%; height: auto; display: block; transition: transform 0.4s ease; object-fit: contain; }
.hub-img-card:hover img { transform: scale(1.025); }
.hub-img-fade { position: absolute; bottom: 0; left: 0; right: 0; height: 50%; background: linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.97) 80%, #fff 100%); pointer-events: none; }
.hub-img-cta { position: absolute; bottom: 20px; left: 24px; display: inline-flex; align-items: center; gap: 10px; background: #2563eb; color: #fff; font-size: 14px; font-weight: 700; font-family: inherit; padding: 12px 22px; border-radius: 10px; border: none; cursor: pointer; z-index: 3; box-shadow: 0 4px 16px rgba(37,99,235,0.35); transition: background 0.2s, transform 0.2s; }
.hub-img-cta:hover { background: #1d4ed8; transform: translateY(-2px); }
.hub-no-access { text-align: center; padding: 48px 32px; }
.hub-no-access-icon { margin-bottom: 16px; }
.hub-no-access h3 { font-size: 18px; font-weight: 700; color: #334155; margin-bottom: 8px; }
.hub-no-access p { font-size: 14px; color: #64748b; }
@media (max-width: 640px) {
  .hub-cards.two-col { grid-template-columns: 1fr; max-width: 420px; }
  .hub-header-inner { padding: 0 20px; }
  .hub-user-info { display: none; }
  .hub-main { padding: 40px 20px; }
  .hub-welcome h1 { font-size: 28px; }
}
`;

const USER_PHOTO_KEY = (email) => `cn_user_photo_${email}`;

export default function App() {
  const [page, setPage] = useState("home");
  const [user, setUser] = useState(null);
  const [userPhoto, setUserPhoto] = useState(null);

  const SESSION_TTL = 2 * 24 * 60 * 60 * 1000;

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("cn_user"));
      if (s && s.loginTime && (Date.now() - s.loginTime) < SESSION_TTL) {
        setUser(s);
        setUserPhoto(localStorage.getItem(USER_PHOTO_KEY(s.email)) || null);
        setPage(s.isAdmin ? "admin" : "hub");
      } else {
        localStorage.removeItem("cn_user");
      }
    } catch {}
  }, []);

  function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file || !user?.email) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      localStorage.setItem(USER_PHOTO_KEY(user.email), dataUrl);
      setUserPhoto(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  // Heartbeat: update lastSeen every 30 s while user is in the hub
  useEffect(() => {
    if (page !== "hub" || !user?.email) return;
    updateLastSeen(user.email); // immediate update on page load / restore
    const id = setInterval(() => updateLastSeen(user.email), 30000);
    return () => clearInterval(id);
  }, [page, user?.email]);

  function handleLogin(userData) {
    const sessionData = { ...userData, loginTime: Date.now() };
    localStorage.setItem("cn_user", JSON.stringify(sessionData));
    setUser(sessionData);
    setUserPhoto(localStorage.getItem(USER_PHOTO_KEY(userData.email)) || null);
    if (!userData.isAdmin) recordLogin(userData.email);
    setPage(userData.isAdmin ? "admin" : "hub");
  }

  function logout() {
    if (user && !user.isAdmin) recordLogout(user.email, user.loginTime);
    localStorage.removeItem("cn_user");
    setUser(null);
    setPage("home");
  }

  /* ── ADMIN PORTAL ── */
  if (page === "admin" && user?.isAdmin) {
    return <AdminPortal admin={user} onLogout={logout} />;
  }

  /* ── HUB ── */
  if (page === "hub" && user) {
    const firstName = user.name?.split(" ")[0] || "there";
    // Default: both tools if no tools array (e.g. legacy backend users)
    const tools = Array.isArray(user.tools) ? user.tools : ["monitoring", "billing"];
    const hasMonitoring = tools.includes("monitoring");
    const hasBilling    = tools.includes("billing");
    const cardCount     = (hasMonitoring ? 1 : 0) + (hasBilling ? 1 : 0);

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
                <label className="hub-avatar-wrap" title="Click to change profile photo">
                  <div className="hub-avatar">
                    {userPhoto
                      ? <img src={userPhoto} alt="profile" />
                      : <AccountIcon />}
                  </div>
                  <div className="hub-avatar-overlay">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  </div>
                  <input type="file" accept="image/*" className="hub-avatar-input" onChange={handlePhotoUpload} />
                </label>
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
              <p>{cardCount > 0 ? "Select a product to continue" : "Contact your administrator to request tool access"}</p>
            </div>

            {cardCount === 0 ? (
              <div className="hub-no-access">
                <div className="hub-no-access-icon"><LockIcon /></div>
                <h3>No tools assigned</h3>
                <p>Your account has not been granted access to any tools yet.<br />Please contact your administrator.</p>
              </div>
            ) : (
              <div className={`hub-cards ${cardCount === 2 ? "two-col" : "one-col"}`}>
                {hasMonitoring && (
                  <div className="hub-img-card" onClick={() => window.open("http://localhost:3007", "_blank")}>
                    <img src="/images/card-monitoring.png" alt="Monitoring" />
                    <div className="hub-img-fade" />
                    <button className="hub-img-cta">Go to Monitoring <ArrowRight /></button>
                  </div>
                )}
                {hasBilling && (
                  <div className="hub-img-card" onClick={() => window.open("http://localhost:3008", "_blank")}>
                    <img src="/images/card-billing.png" alt="Billing" />
                    <div className="hub-img-fade" />
                    <button className="hub-img-cta">Go to Billing <ArrowRight /></button>
                  </div>
                )}
              </div>
            )}
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
