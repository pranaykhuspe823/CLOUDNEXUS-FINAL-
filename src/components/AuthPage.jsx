import { useState } from "react";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

const BACKEND = "http://localhost:3001";

function CloudNexusPoster() {
  return (
    <div style={{fontFamily:"'Inter',sans-serif",width:520,height:520,background:"linear-gradient(145deg,#f0f6ff 0%,#e8f0fe 40%,#f0f4ff 70%,#f0f9ff 100%)",display:"grid",gridTemplateRows:"auto 1fr auto",overflow:"hidden",borderRadius:14,border:"1px solid #dde6f5",position:"relative",boxShadow:"0 20px 60px rgba(37,99,235,0.15)"}}>
      <div style={{height:4,background:"linear-gradient(90deg,#2563eb 0%,#7c3aed 50%,#0ea5e9 100%)",width:"100%"}}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gridTemplateRows:"auto auto auto",gap:9,padding:"12px 14px 9px"}}>
        {/* Hero */}
        <div style={{gridColumn:"1/3",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:"11px 15px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
              <div style={{width:26,height:26,background:"linear-gradient(135deg,#eff6ff,#dbeafe)",borderRadius:7,border:"1.5px solid #bfdbfe",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 17Q4 13 7 12Q7 8 11 8Q13 6 16 7Q19 8 19 11Q21 11 21 14Q21 17 18 17Z" fill="none" stroke="#2563eb" strokeWidth="1.8" strokeLinejoin="round"/></svg>
              </div>
              <span style={{fontSize:9,fontWeight:800,color:"#1e40af",letterSpacing:3}}>CLOUDNEXUS</span>
            </div>
            <div style={{fontSize:30,fontWeight:900,color:"#0f172a",letterSpacing:-1.5,lineHeight:1}}>CLOUD<span style={{color:"#2563eb"}}>NEXUS</span></div>
            <div style={{fontSize:8,fontWeight:700,color:"#3b82f6",letterSpacing:2,marginTop:4}}>UNIFIED MULTI-CLOUD PLATFORM</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:5,alignItems:"flex-end"}}>
            {[["Amazon AWS","#fff7ed","#c2410c","#fed7aa"],["Microsoft Azure","#eff6ff","#1d4ed8","#bfdbfe"],["Google Cloud","#fefce8","#a16207","#fde68a"]].map(([label,bg,color,border])=>(
              <div key={label} style={{fontSize:8,fontWeight:700,padding:"4px 10px",borderRadius:20,letterSpacing:0.8,background:bg,color,border:`1px solid ${border}`}}>{label}</div>
            ))}
          </div>
        </div>

        {/* Monitoring */}
        <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:10,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
          <div style={{fontSize:7.5,fontWeight:800,color:"#64748b",letterSpacing:2,textTransform:"uppercase",marginBottom:8,display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:"#22c55e",flexShrink:0}}/>REAL-TIME MONITORING
          </div>
          <div style={{display:"flex",gap:5,marginBottom:7}}>
            {/* CPU bars */}
            <div style={{flex:1,background:"#f8fafc",border:"1px solid #f1f5f9",borderRadius:6,padding:"5px 4px"}}>
              <div style={{fontSize:6.5,fontWeight:700,color:"#94a3b8",letterSpacing:0.8,marginBottom:3,textTransform:"uppercase"}}>CPU</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:1.5,height:20}}>
                {[40,65,35,82,55,72,48].map((h,i)=><div key={i} style={{flex:1,height:`${h}%`,background:i===3?"#2563eb":i%2===0?"#93c5fd":"#60a5fa",borderRadius:"1px 1px 0 0"}}/>)}
              </div>
            </div>
            {/* Memory line */}
            <div style={{flex:1,background:"#f8fafc",border:"1px solid #f1f5f9",borderRadius:6,padding:"5px 4px"}}>
              <div style={{fontSize:6.5,fontWeight:700,color:"#94a3b8",letterSpacing:0.8,marginBottom:3,textTransform:"uppercase"}}>Memory</div>
              <svg width="100%" height="20" viewBox="0 0 60 20" preserveAspectRatio="none">
                <polyline points="0,18 8,13 16,16 24,8 32,12 40,5 48,8 60,2" fill="none" stroke="#60a5fa" strokeWidth="1.8"/>
                <polyline points="0,18 8,13 16,16 24,8 32,12 40,5 48,8 60,2 60,20 0,20" fill="rgba(59,130,246,0.07)"/>
              </svg>
            </div>
            {/* Health donut */}
            <div style={{flex:1,background:"#f8fafc",border:"1px solid #f1f5f9",borderRadius:6,padding:"5px 4px",display:"flex",flexDirection:"column",alignItems:"center"}}>
              <div style={{fontSize:6.5,fontWeight:700,color:"#94a3b8",letterSpacing:0.8,marginBottom:2,textTransform:"uppercase"}}>Health</div>
              <svg viewBox="0 0 38 38" width="32" height="32">
                <circle cx="19" cy="19" r="13" fill="none" stroke="#f0fdf4" strokeWidth="5"/>
                <circle cx="19" cy="19" r="13" fill="none" stroke="#22c55e" strokeWidth="5" strokeDasharray="82 3" strokeDashoffset="20" strokeLinecap="round"/>
                <text x="19" y="22.5" textAnchor="middle" fontSize="8" fontWeight="800" fill="#16a34a" fontFamily="Inter,sans-serif">98%</text>
              </svg>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4}}>
            {[["Instances","154","#2563eb"],["Latency","22ms","#16a34a"],["Alerts","3","#dc2626"]].map(([l,v,c])=>(
              <div key={l} style={{background:"#f8fafc",border:"1px solid #f1f5f9",borderRadius:6,padding:"5px 6px"}}>
                <div style={{fontSize:6.5,fontWeight:700,color:"#94a3b8",letterSpacing:0.5,textTransform:"uppercase"}}>{l}</div>
                <div style={{fontSize:15,fontWeight:800,color:c,lineHeight:1.1}}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Cloud providers hub */}
        <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:10,boxShadow:"0 1px 4px rgba(0,0,0,0.04)",position:"relative"}}>
          <div style={{fontSize:7.5,fontWeight:800,color:"#64748b",letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>CLOUD PROVIDERS</div>
          <div style={{position:"relative",height:130}}>
            <svg style={{position:"absolute",inset:0,width:"100%",height:"100%"}} viewBox="0 0 240 130">
              <circle cx="120" cy="65" r="38" fill="none" stroke="#dbeafe" strokeWidth="1" strokeDasharray="4,4"/>
              <line x1="52" y1="65" x2="90" y2="65" stroke="#bfdbfe" strokeWidth="1.2" strokeDasharray="4,3"/>
              <line x1="148" y1="47" x2="178" y2="28" stroke="#bfdbfe" strokeWidth="1.2" strokeDasharray="4,3"/>
              <line x1="148" y1="83" x2="178" y2="102" stroke="#bfdbfe" strokeWidth="1.2" strokeDasharray="4,3"/>
              <circle cx="52" cy="65" r="3" fill="#93c5fd"/>
              <circle cx="178" cy="28" r="3" fill="#fbbf24"/>
              <circle cx="178" cy="102" r="3" fill="#60a5fa"/>
            </svg>
            {/* AWS */}
            <div style={{position:"absolute",left:0,top:"50%",transform:"translateY(-50%)"}}>
              <div style={{background:"#fff",borderRadius:8,padding:"5px 7px",border:"1px solid #fed7aa",boxShadow:"0 1px 4px rgba(0,0,0,0.05)",width:60,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <span style={{fontSize:12,fontWeight:900,color:"#ea580c"}}>aws</span>
                <span style={{fontSize:7,fontWeight:800,color:"#c2410c",letterSpacing:0.8}}>AWS</span>
              </div>
            </div>
            {/* Center hub */}
            <div style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",textAlign:"center"}}>
              <div style={{width:58,height:58,borderRadius:"50%",background:"linear-gradient(135deg,#eff6ff,#dbeafe)",border:"2px solid #93c5fd",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",boxShadow:"0 0 0 5px rgba(59,130,246,0.06)"}}>
                <svg width="22" height="17" viewBox="0 0 26 20" fill="none"><path d="M5 15Q3 15 2 12Q1 11 1 9Q1 5 4 4Q4 1 8 2Q10 0 13 1Q16 0 17 2Q20 2 21 5Q24 5 24 8Q24 12 21 13Q20 16 17 15Z" fill="none" stroke="#2563eb" strokeWidth="1.4"/></svg>
              </div>
              <div style={{fontSize:8,fontWeight:800,color:"#1e40af",marginTop:3}}><span style={{color:"#3b82f6"}}>Cloud</span>Nexus</div>
            </div>
            {/* Azure */}
            <div style={{position:"absolute",right:0,top:4}}>
              <div style={{background:"#fff",borderRadius:8,padding:"5px 7px",border:"1px solid #bfdbfe",boxShadow:"0 1px 4px rgba(0,0,0,0.05)",width:60,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <svg width="22" height="16" viewBox="0 0 24 18"><polygon points="4,17 0,17 7,3 11,10" fill="#0078d4" opacity="0.85"/><polygon points="11,10 16,17 4,17" fill="#0050a0"/><polygon points="7,3 19,3 16,17 11,10" fill="#50a0e0" opacity="0.85"/></svg>
                <span style={{fontSize:7,fontWeight:800,color:"#1d4ed8",letterSpacing:0.8}}>AZURE</span>
              </div>
            </div>
            {/* GCP */}
            <div style={{position:"absolute",right:0,bottom:2}}>
              <div style={{background:"#fff",borderRadius:8,padding:"5px 7px",border:"1px solid #fde68a",boxShadow:"0 1px 4px rgba(0,0,0,0.05)",width:60,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <svg width="22" height="16" viewBox="0 0 24 18"><path d="M4 14 A8 8 0 0 1 20 14" fill="none" stroke="#4285f4" strokeWidth="2.8" strokeLinecap="round"/><circle cx="4" cy="14" r="3" fill="#ea4335"/><circle cx="20" cy="14" r="3" fill="#34a853"/><circle cx="12" cy="6" r="3" fill="#fbbc05"/></svg>
                <span style={{fontSize:6.5,fontWeight:800,color:"#1a56db",letterSpacing:0.5}}>GOOGLE CLOUD</span>
              </div>
            </div>
          </div>
        </div>

        {/* Billing */}
        <div style={{gridColumn:"1/3",background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:10,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
          <div style={{fontSize:7.5,fontWeight:800,color:"#64748b",letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>COST OPTIMIZATION & BILLING</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {/* Trend bars */}
            <div style={{background:"#f8fafc",border:"1px solid #f1f5f9",borderRadius:7,padding:7}}>
              <div style={{fontSize:6.5,fontWeight:700,color:"#94a3b8",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Monthly Spend Trend</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:1.5,height:30}}>
                {[28,42,36,54,46,60,50,73,64,82,76,96].map((h,i)=><div key={i} style={{flex:1,height:`${h}%`,background:h>70?"#2563eb":h>50?"#60a5fa":"#bfdbfe",borderRadius:"1px 1px 0 0"}}/>)}
              </div>
            </div>
            {/* Donut */}
            <div style={{background:"#f8fafc",border:"1px solid #f1f5f9",borderRadius:7,padding:7}}>
              <div style={{fontSize:6.5,fontWeight:700,color:"#94a3b8",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Provider Split</div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <svg viewBox="0 0 46 46" width="42" height="42" style={{flexShrink:0}}>
                  <circle cx="23" cy="23" r="16" fill="none" stroke="#ea580c" strokeWidth="6" strokeDasharray="20 30" strokeDashoffset="0"/>
                  <circle cx="23" cy="23" r="16" fill="none" stroke="#0078d4" strokeWidth="6" strokeDasharray="16 34" strokeDashoffset="-20"/>
                  <circle cx="23" cy="23" r="16" fill="none" stroke="#4285f4" strokeWidth="6" strokeDasharray="13 37" strokeDashoffset="-36"/>
                  <circle cx="23" cy="23" r="4.5" fill="#f8fafc"/>
                </svg>
                <div style={{fontSize:7.5,color:"#64748b",lineHeight:1.85}}>
                  <div><b style={{color:"#334155"}}>AWS</b> 38%</div>
                  <div><b style={{color:"#334155"}}>Azure</b> 31%</div>
                  <div><b style={{color:"#334155"}}>GCP</b> 24%</div>
                </div>
              </div>
              <div style={{fontSize:11,fontWeight:800,color:"#1e293b",marginTop:4}}>$41,320</div>
            </div>
            {/* Savings */}
            <div style={{background:"#f8fafc",border:"1px solid #f1f5f9",borderRadius:7,padding:7}}>
              <div style={{fontSize:6.5,fontWeight:700,color:"#94a3b8",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Savings Found</div>
              <div style={{fontSize:16,fontWeight:800,color:"#16a34a"}}>$2,450</div>
              <div style={{fontSize:6.5,fontWeight:700,color:"#16a34a",letterSpacing:0.5,marginTop:2}}>UNUSED RESOURCES</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:1.5,height:20,marginTop:7}}>
                {[28,42,56,66,76,87,100].map((h,i)=><div key={i} style={{flex:1,height:`${h}%`,background:"#86efac",borderRadius:"1px 1px 0 0"}}/>)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{background:"linear-gradient(90deg,#1e3a8a,#2563eb,#4338ca)",padding:"11px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontSize:13,fontWeight:900,color:"#fff",letterSpacing:2}}>MONITOR. OPTIMIZE. SAVE.</span>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:7.5,color:"#bfdbfe",letterSpacing:0.8}}>CloudNexus · Simplifying Multi-Cloud Operations</div>
        </div>
      </div>
    </div>
  );
}

const CloudIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
);

function createTOTP(email, secretBase32) {
  return new OTPAuth.TOTP({
    issuer: "CloudNexus",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: secretBase32
      ? OTPAuth.Secret.fromBase32(secretBase32)
      : new OTPAuth.Secret({ size: 20 }),
  });
}

export default function AuthPage({ onLogin, onBack }) {
  const [authStep, setAuthStep] = useState("login");
  const [isLogin,  setIsLogin]  = useState(true);
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [code,     setCode]     = useState("");
  const [loading,  setLoading]  = useState(false);
  const [alert,    setAlert]    = useState(null);
  const [user,     setUser]     = useState(null);
  const [qrDataUrl,setQrDataUrl]= useState("");
  const [totpSecret,setTotpSecret]=useState("");

  function showAlert(type, msg, ms = 6000) {
    setAlert({ type, msg });
    if (ms > 0) setTimeout(() => setAlert(null), ms);
  }

  /* ── REGISTER ── */
  async function handleRegister() {
    if (!name.trim() || !email.trim() || !password) {
      showAlert("red", "Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      // Generate TOTP secret + QR code locally
      const totp   = createTOTP(email);
      const secret = totp.secret.base32;
      setTotpSecret(secret);
      const uri    = totp.toString();
      const dataUrl = await QRCode.toDataURL(uri, {
        width: 220, margin: 2, color: { dark: "#0f172a", light: "#ffffff" },
      });
      setQrDataUrl(dataUrl);
      setUser({ name, email, password, totpSecret: secret });
      setAuthStep("setup-2fa");
      setCode("");
      setAlert(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm2FA() {
    if (!code || code.length !== 6) {
      showAlert("red", "Enter the 6-digit code from your authenticator app.");
      return;
    }
    const totp  = createTOTP(email, totpSecret);
    const delta = totp.validate({ token: code, window: 6 });
    if (delta === null) {
      showAlert("red", "Invalid code. Make sure you scanned the QR code and entered the current code. If the issue persists, ensure your phone clock is set to automatic/network time.");
      return;
    }
    setLoading(true);
    try {
      // Save to DB via backend
      const res = await fetch(`${BACKEND}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, totpSecret }),
      });
      const data = await res.json();
      if (!res.ok) {
        showAlert("red", data.error || "Registration failed.");
        return;
      }
      // Mark MFA as verified
      await fetch(`${BACKEND}/auth/verify-mfa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      showAlert("green", "Account created with 2FA enabled! You can now sign in.");
      setIsLogin(true);
      setAuthStep("login");
      setName(""); setEmail(""); setPassword("");
      setCode(""); setQrDataUrl(""); setTotpSecret("");
    } catch {
      showAlert("red", "Could not reach backend. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  /* ── LOGIN ── */
  async function handleLogin() {
    if (!email || !password) {
      showAlert("red", "Enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      const res  = await fetch(`${BACKEND}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        showAlert("red", data.error || "Invalid email or password.");
        return;
      }
      const foundUser = data.user;
      setUser(foundUser);
      setTotpSecret(foundUser.totpSecret);
      setAuthStep("verify-login");
      setCode("");
      setAlert(null);
    } catch {
      // Fallback to localStorage for offline dev
      const users = JSON.parse(localStorage.getItem("cn_users") || "[]");
      const found = users.find(u => u.email === email && u.password === password);
      if (!found) { showAlert("red", "Invalid email or password."); return; }
      setUser(found);
      setTotpSecret(found.totpSecret);
      setAuthStep("verify-login");
      setCode(""); setAlert(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyLogin() {
    if (!code || code.length !== 6) {
      showAlert("red", "Enter the 6-digit code from your authenticator app.");
      return;
    }
    if (!user?.totpSecret) {
      showAlert("red", "Account configuration error. Please contact support.");
      return;
    }
    const totp  = createTOTP(user.email, user.totpSecret);
    const delta = totp.validate({ token: code, window: 6 });
    if (delta === null) {
      showAlert("red", "Invalid code. Open your authenticator app and enter the current 6-digit code for CloudNexus. If the issue persists, ensure your phone clock is set to automatic/network time.");
      return;
    }
    // Update last login in DB
    try {
      await fetch(`${BACKEND}/auth/verify-mfa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
    } catch {}
    localStorage.setItem("cn_user", JSON.stringify(user));
    onLogin(user);
  }

  function resetToLogin() {
    setAuthStep("login");
    setAlert(null); setCode(""); setQrDataUrl(""); setTotpSecret("");
  }

  return (
    <div className="auth-page">
      <div className="auth-left">
        <div className="auth-left-content">
          <img
            src="/images/login-photo.png"
            alt="CloudNexus Platform"
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
          />
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form-wrap">

          {authStep === "setup-2fa" ? (
            <>
              <div className="step-progress">
                <div className="step-bar done" /><div className="step-bar active" />
              </div>
              <div className="auth-form-header">
                <h2>Set up authenticator</h2>
                <p>Scan the QR code below with your authenticator app (Google Authenticator, Microsoft Authenticator, etc.) then enter the 6-digit code to verify.</p>
              </div>
              {qrDataUrl && (
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                  <div style={{ display: "inline-block", padding: 16, background: "#fff", border: "1px solid var(--border)", borderRadius: 12 }}>
                    <img src={qrDataUrl} alt="Scan with authenticator app" style={{ display: "block", width: 200, height: 200 }} />
                  </div>
                  <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
                    Can't scan? Enter this key manually:
                    <div style={{ marginTop: 4, fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "var(--text)", letterSpacing: 1, background: "var(--bg)", padding: "6px 12px", borderRadius: 6, display: "inline-block", wordBreak: "break-all", userSelect: "all" }}>
                      {totpSecret}
                    </div>
                  </div>
                </div>
              )}
              <div className="field">
                <label className="field-label">Verification code</label>
                <input className="field-input" maxLength={6} placeholder="Enter 6-digit code" value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={e => e.key === "Enter" && handleConfirm2FA()}
                  autoFocus style={{ textAlign: "center", fontSize: 20, fontWeight: 700, letterSpacing: 6 }} />
              </div>
              <button className="btn btn-primary btn-lg" style={{ width: "100%" }}
                onClick={handleConfirm2FA} disabled={code.length !== 6 || loading}>
                {loading ? "Saving…" : "Verify & Create Account"}
              </button>
              <button className="btn btn-ghost btn-md" style={{ width: "100%", marginTop: 8 }} onClick={resetToLogin}>← Cancel</button>
            </>

          ) : authStep === "verify-login" ? (
            <>
              <div className="step-progress">
                <div className="step-bar done" /><div className="step-bar active" />
              </div>
              <div className="auth-form-header">
                <h2>Two-factor authentication</h2>
                <p>Open your authenticator app and enter the 6-digit code for <strong>CloudNexus</strong>.</p>
              </div>
              <div className="field">
                <label className="field-label">Authentication code</label>
                <input className="field-input" maxLength={6} placeholder="000000" value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={e => e.key === "Enter" && handleVerifyLogin()}
                  autoFocus style={{ textAlign: "center", fontSize: 20, fontWeight: 700, letterSpacing: 6 }} />
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                  The code refreshes every 30 seconds — enter it promptly
                </div>
              </div>
              <button className="btn btn-primary btn-lg" style={{ width: "100%" }}
                onClick={handleVerifyLogin} disabled={code.length !== 6}>
                Verify & Sign In
              </button>
              <button className="btn btn-ghost btn-md" style={{ width: "100%", marginTop: 8 }} onClick={resetToLogin}>← Back to sign in</button>
            </>

          ) : isLogin ? (
            <>
              <div className="step-progress">
                <div className="step-bar active" /><div className="step-bar" />
              </div>
              <div className="auth-form-header">
                <h2>Welcome back</h2>
                <p>Enter your credentials to access your dashboard.</p>
              </div>
              <div className="field">
                <label className="field-label">Email address</label>
                <input className="field-input" placeholder="you@company.com" value={email}
                  onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Password</label>
                <input className="field-input" type="password" placeholder="Enter your password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleLogin()} />
              </div>
              <button className="btn btn-primary btn-lg" style={{ width: "100%" }}
                onClick={handleLogin} disabled={loading}>
                {loading ? "Signing in…" : "Continue"}
              </button>
              <div className="auth-divider">or</div>
              <button className="btn btn-secondary btn-lg" style={{ width: "100%" }}
                onClick={() => { setIsLogin(false); setAlert(null); }}>
                Create an account
              </button>
              <div className="auth-switch">
                <button className="btn btn-text btn-sm" onClick={onBack}>← Back to home</button>
              </div>
            </>

          ) : (
            <>
              <div className="auth-form-header">
                <h2>Create your account</h2>
                <p>Set up your CloudNexus workspace in seconds. No credit card required.</p>
              </div>
              <div className="field">
                <label className="field-label">Full name</label>
                <input className="field-input" placeholder="Jane Smith" value={name}
                  onChange={e => setName(e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Email address</label>
                <input className="field-input" placeholder="you@company.com" value={email}
                  onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Password</label>
                <input className="field-input" type="password" placeholder="Create a strong password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleRegister()} />
              </div>
              <button className="btn btn-primary btn-lg" style={{ width: "100%" }}
                onClick={handleRegister} disabled={loading}>
                {loading ? "Setting up…" : "Continue"}
              </button>
              <div className="auth-divider">or</div>
              <button className="btn btn-secondary btn-lg" style={{ width: "100%" }}
                onClick={() => { setIsLogin(true); setAlert(null); }}>
                Sign in instead
              </button>
              <div className="auth-switch">
                <button className="btn btn-text btn-sm" onClick={onBack}>← Back to home</button>
              </div>
            </>
          )}

          {alert && <div className={`alert alert-${alert.type}`}>{alert.msg}</div>}
        </div>
      </div>
    </div>
  );
}
