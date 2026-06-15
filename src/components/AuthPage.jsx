import { useState } from "react";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

const BACKEND      = "";
const ADMIN_USERS  = "cn_admin_users";
const SETTINGS_KEY = "cn_settings";

function getMFAEnabled() {
  try { return !!JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}").mfaForUsers; } catch { return false; }
}
function saveTOTPSecret(email, secret) {
  try {
    const users = JSON.parse(localStorage.getItem(ADMIN_USERS) || "[]");
    const updated = users.map(u =>
      u.email.toLowerCase() === email.toLowerCase()
        ? { ...u, totpSecret: secret, mfaVerified: true }
        : u
    );
    localStorage.setItem(ADMIN_USERS, JSON.stringify(updated));
  } catch {}
}
function buildTOTP(email, secret) {
  return new OTPAuth.TOTP({
    issuer: "CloudNexus",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

export default function AuthPage({ onLogin, onBack }) {
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [showPass,    setShowPass]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [alert,       setAlert]       = useState(null);

  // MFA flow
  const [step,        setStep]        = useState("login"); // "login" | "setup-mfa" | "verify-mfa"
  const [pendingUser, setPendingUser] = useState(null);
  const [totpSecret,  setTotpSecret]  = useState("");
  const [qrDataUrl,   setQrDataUrl]   = useState("");
  const [code,        setCode]        = useState("");
  const [codeLoading, setCodeLoading] = useState(false);

  function showAlert(type, msg, ms = 6000) {
    setAlert({ type, msg });
    if (ms > 0) setTimeout(() => setAlert(null), ms);
  }

  /* After password is verified, decide MFA path */
  async function proceedWithUser(userData) {
    if (!getMFAEnabled()) {
      onLogin(userData);
      return;
    }

    // Find the full user record (needs totpSecret if already set up)
    const adminUsers = JSON.parse(localStorage.getItem(ADMIN_USERS) || "[]");
    const record = adminUsers.find(u => u.email.toLowerCase() === userData.email.toLowerCase());
    setPendingUser(userData);

    if (record?.totpSecret && record?.mfaVerified) {
      // Already enrolled → go straight to verify
      setTotpSecret(record.totpSecret);
      setCode("");
      setStep("verify-mfa");
      return;
    }

    // First login with MFA → generate QR code
    const totp = new OTPAuth.TOTP({
      issuer: "CloudNexus",
      label: userData.email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: new OTPAuth.Secret({ size: 20 }),
    });
    const secret  = totp.secret.base32;
    const dataUrl = await QRCode.toDataURL(totp.toString(), {
      width: 220, margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
    });
    setTotpSecret(secret);
    setQrDataUrl(dataUrl);
    setCode("");
    setStep("setup-mfa");
  }

  /* Login — password check */
  async function handleLogin() {
    if (!email || !password) { showAlert("red", "Enter your email and password."); return; }
    setAlert(null);

    // Admin hard-coded credentials (no MFA for admin)
    if (email.toLowerCase() === "admin@core5.co.in" && password === "admin123") {
      onLogin({ name: "Administrator", email: "admin@core5.co.in", isAdmin: true });
      return;
    }

    // Always try the backend first — it has the authoritative role, isAdmin, and orgAdmin values.
    // This ensures co-admins and promoted users are routed correctly.
    setLoading(true);
    let success = false;
    try {
      const res = await fetch(`${BACKEND}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const data = await res.json();
        setLoading(false);
        await proceedWithUser(data.user);
        success = true;
      } else {
        // Backend returned an error (wrong password, deleted user, etc.)
        const err = await res.json().catch(() => ({}));
        setLoading(false);
        showAlert("red", err.error || "Invalid email or password.");
        return;
      }
    } catch {
      // Backend unreachable — fall back to localStorage (legacy users only)
      try {
        const adminUsers = JSON.parse(localStorage.getItem(ADMIN_USERS) || "[]");
        const match = adminUsers.find(
          u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
        );
        if (match) {
          setLoading(false);
          await proceedWithUser({ name: match.name, email: match.email, tools: match.tools });
          return;
        }
      } catch {}
      setLoading(false);
      showAlert("red", "Cannot reach the server. Please try again.");
    }
  }

  /* MFA — first-time setup: verify the code, then save secret */
  function handleSetupMFA() {
    if (!code || code.length !== 6) { showAlert("red", "Enter the 6-digit code from your authenticator app."); return; }
    setCodeLoading(true);
    try {
      const totp  = buildTOTP(pendingUser.email, totpSecret);
      const delta = totp.validate({ token: code, window: 6 });
      if (delta === null) {
        showAlert("red", "Invalid code. Make sure you scanned the QR code correctly and that your phone clock is synced.");
        return;
      }
      saveTOTPSecret(pendingUser.email, totpSecret);
      onLogin(pendingUser);
    } finally {
      setCodeLoading(false);
    }
  }

  /* MFA — returning user: just verify the code */
  function handleVerifyMFA() {
    if (!code || code.length !== 6) { showAlert("red", "Enter the 6-digit code from your authenticator app."); return; }
    setCodeLoading(true);
    try {
      const totp  = buildTOTP(pendingUser.email, totpSecret);
      const delta = totp.validate({ token: code, window: 6 });
      if (delta === null) {
        showAlert("red", "Invalid code. The code refreshes every 30 seconds — try the current one.");
        return;
      }
      onLogin(pendingUser);
    } finally {
      setCodeLoading(false);
    }
  }

  function backToLogin() {
    setStep("login");
    setCode("");
    setAlert(null);
    setPendingUser(null);
    setTotpSecret("");
    setQrDataUrl("");
  }

  /* ── Render ── */
  return (
    <div className="auth-page">

      {/* Left — cover image */}
      <div className="auth-left">
        <div className="auth-left-content">
          <img
            src="/images/login-photo.png"
            alt="CloudNexus Platform"
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
          />
        </div>
      </div>

      {/* Right — form area */}
      <div className="auth-right">
        <div className="auth-form-wrap">

          {/* ── STEP: login ── */}
          {step === "login" && (
            <>
              <div className="auth-form-header">
                <h2>Welcome back</h2>
                <p>Sign in to your CloudNexus account.</p>
              </div>

              <div className="field">
                <label className="field-label">Email address</label>
                <input
                  className="field-input"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="field">
                <label className="field-label">Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    className="field-input"
                    type={showPass ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleLogin()}
                    style={{ paddingRight: 42 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(p => !p)}
                    style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"var(--text-muted)", padding:2, display:"flex", alignItems:"center" }}
                  >
                    {showPass ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                className="btn btn-primary btn-lg"
                style={{ width: "100%", marginTop: 4 }}
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>

              <div className="auth-switch">
                <button className="btn btn-text btn-sm" onClick={onBack}>← Back to home</button>
              </div>
            </>
          )}

          {/* ── STEP: setup-mfa (first login) ── */}
          {step === "setup-mfa" && (
            <>
              <div className="auth-form-header">
                <h2>Set up authenticator</h2>
                <p>Your organisation requires two-factor authentication. Scan the QR code below with <strong>Google Authenticator</strong>, <strong>Authy</strong>, or any TOTP app, then enter the 6-digit code to continue.</p>
              </div>

              {qrDataUrl && (
                <div style={{ textAlign:"center", marginBottom:20 }}>
                  <div style={{ display:"inline-block", padding:14, background:"#fff", border:"1.5px solid var(--border)", borderRadius:14, boxShadow:"0 2px 12px rgba(0,0,0,0.07)" }}>
                    <img src={qrDataUrl} alt="Scan this QR code" style={{ display:"block", width:200, height:200 }} />
                  </div>
                  <div style={{ marginTop:12, fontSize:12, color:"var(--text-muted)" }}>
                    Can't scan? Enter this key manually:
                    <div style={{ marginTop:5, fontFamily:"monospace", fontSize:12, fontWeight:700, color:"var(--text)", letterSpacing:1.5, background:"var(--bg)", padding:"6px 12px", borderRadius:7, display:"inline-block", wordBreak:"break-all", userSelect:"all", border:"1px solid var(--border)" }}>
                      {totpSecret}
                    </div>
                  </div>
                </div>
              )}

              <div className="field">
                <label className="field-label">Verification code</label>
                <input
                  className="field-input"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={e => e.key === "Enter" && code.length === 6 && handleSetupMFA()}
                  autoFocus
                  style={{ textAlign:"center", fontSize:22, fontWeight:700, letterSpacing:8 }}
                />
                <div style={{ marginTop:6, fontSize:12, color:"var(--text-muted)", textAlign:"center" }}>
                  Code refreshes every 30 seconds — enter it promptly after scanning
                </div>
              </div>

              <button
                className="btn btn-primary btn-lg"
                style={{ width:"100%" }}
                onClick={handleSetupMFA}
                disabled={code.length !== 6 || codeLoading}
              >
                {codeLoading ? "Verifying…" : "Verify & Continue"}
              </button>
              <button className="btn btn-ghost btn-md" style={{ width:"100%", marginTop:8 }} onClick={backToLogin}>
                ← Back to sign in
              </button>
            </>
          )}

          {/* ── STEP: verify-mfa (returning user) ── */}
          {step === "verify-mfa" && (
            <>
              <div className="auth-form-header">
                <h2>Two-factor authentication</h2>
                <p>Open your authenticator app and enter the 6-digit code for <strong>CloudNexus</strong>.</p>
              </div>

              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", marginBottom:20 }}>
                <div style={{ width:56, height:56, borderRadius:14, background:"linear-gradient(135deg,#eff6ff,#dbeafe)", border:"1.5px solid #bfdbfe", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><circle cx="12" cy="16" r="1" fill="#2563eb"/>
                  </svg>
                </div>
              </div>

              <div className="field">
                <label className="field-label">Authentication code</label>
                <input
                  className="field-input"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={e => e.key === "Enter" && code.length === 6 && handleVerifyMFA()}
                  autoFocus
                  style={{ textAlign:"center", fontSize:22, fontWeight:700, letterSpacing:8 }}
                />
                <div style={{ marginTop:6, fontSize:12, color:"var(--text-muted)", textAlign:"center" }}>
                  The code refreshes every 30 seconds
                </div>
              </div>

              <button
                className="btn btn-primary btn-lg"
                style={{ width:"100%" }}
                onClick={handleVerifyMFA}
                disabled={code.length !== 6 || codeLoading}
              >
                {codeLoading ? "Verifying…" : "Verify & Sign In"}
              </button>
              <button className="btn btn-ghost btn-md" style={{ width:"100%", marginTop:8 }} onClick={backToLogin}>
                ← Back to sign in
              </button>
            </>
          )}

          {alert && <div className={`alert alert-${alert.type}`} style={{ marginTop:16 }}>{alert.msg}</div>}

        </div>
      </div>
    </div>
  );
}
