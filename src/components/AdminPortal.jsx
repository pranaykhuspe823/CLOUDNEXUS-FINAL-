import { useState, useEffect } from "react";

/* ── Icons ── */
const CloudIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
);
const UsersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const AccessIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const PlanIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
  </svg>
);
const AccountIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
  </svg>
);
const SettingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);
const LogoutIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);
const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
);
const CopyIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
);
const TrashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
);
const EyeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
);
const EyeOffIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
);
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
);
const MonitoringNavIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);
const BillingNavIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
  </svg>
);
const ArrowRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
);

/* ── Helpers ── */
const USERS_KEY    = "cn_admin_users";
const ACTIVITY_KEY = "cn_user_activity";
const PROFILE_KEY  = "cn_admin_profile";
const SETTINGS_KEY = "cn_settings";

function getUserPhoto(email) {
  try { return localStorage.getItem(`cn_user_photo_${email}`) || null; } catch { return null; }
}

function getGlobalSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch { return {}; }
}
function saveGlobalSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}
const ONLINE_MS    = 90 * 1000; // 90 s — two missed 30-s heartbeats → offline

function getAdminProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)); } catch { return null; }
}
function saveAdminProfile(p) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {}
}

function getUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || "[]"); } catch { return []; }
}
function saveUsers(list) {
  localStorage.setItem(USERS_KEY, JSON.stringify(list));
}
function getActivity() {
  try { return JSON.parse(localStorage.getItem(ACTIVITY_KEY) || "{}"); } catch { return {}; }
}
function isOnline(act) {
  return !!(act?.lastSeen && (Date.now() - act.lastSeen) < ONLINE_MS);
}
function fmtDuration(ms) {
  if (!ms || ms < 0) return "—";
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
}
function fmtDateTime(ts) {
  if (!ts) return "Never";
  const d    = new Date(ts);
  const now  = new Date();
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString())  return `Today, ${time}`;
  if (d.toDateString() === yest.toDateString()) return `Yesterday, ${time}`;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + `, ${time}`;
}
function genPassword() {
  const u = "ABCDEFGHJKMNPQRSTUVWXYZ", l = "abcdefghjkmnpqrstuvwxyz", d = "23456789", s = "@#$!";
  const all = u + l + d + s;
  let p = [u[~~(Math.random()*u.length)], l[~~(Math.random()*l.length)], d[~~(Math.random()*d.length)], s[~~(Math.random()*s.length)]];
  for (let i = 4; i < 12; i++) p.push(all[~~(Math.random()*all.length)]);
  return p.sort(() => Math.random() - 0.5).join("");
}
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/* ── CSS ── */
const css = `
.ap-wrap { min-height:100vh; display:flex; font-family:'Inter',-apple-system,sans-serif; background:#f1f5f9; }

/* Sidebar */
.ap-sidebar {
  width:64px; background:#07111f; display:flex; flex-direction:column; align-items:center;
  padding:18px 0 16px; position:fixed; top:0; left:0; bottom:0; z-index:200;
  border-right:1px solid rgba(255,255,255,0.06);
}
.ap-logo-btn {
  width:38px; height:38px; background:#2563eb; border-radius:9px; border:none; cursor:pointer;
  display:flex; align-items:center; justify-content:center; margin-bottom:28px; flex-shrink:0;
}
.ap-nav { display:flex; flex-direction:column; gap:4px; align-items:center; flex:1; }
.ap-nav-btn {
  width:44px; height:44px; border-radius:11px; border:none; background:transparent; cursor:pointer;
  display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,0.45);
  transition:all 0.18s; position:relative;
}
.ap-nav-btn:hover { background:rgba(255,255,255,0.08); color:#fff; }
.ap-nav-btn.ap-active { background:rgba(37,99,235,0.3); color:#60a5fa; }
.ap-nav-tip {
  position:absolute; left:calc(100% + 10px); background:#1e293b; color:#f1f5f9;
  font-size:12px; font-weight:600; padding:5px 11px; border-radius:7px; white-space:nowrap;
  opacity:0; pointer-events:none; transition:opacity 0.15s; z-index:300;
  border:1px solid rgba(255,255,255,0.08);
}
.ap-nav-btn:hover .ap-nav-tip { opacity:1; }
.ap-nav-divider { width:32px; height:1px; background:rgba(255,255,255,0.1); margin:8px 0; flex-shrink:0; }
.ap-nav-btn.tool-monitoring.ap-active { background:rgba(37,99,235,0.3); color:#60a5fa; }
.ap-nav-btn.tool-billing.ap-active   { background:rgba(22,163,74,0.25); color:#4ade80; }
.ap-logout { margin-top:auto; }

/* Tool section */
.ap-tool-launch-card {
  position:relative; border-radius:18px; overflow:hidden; cursor:pointer;
  box-shadow:0 16px 48px rgba(37,99,235,0.14),0 4px 12px rgba(0,0,0,0.08);
  background:#f0f4ff; max-width:620px;
  transition:transform 0.3s ease, box-shadow 0.3s ease;
}
.ap-tool-launch-card:hover { transform:translateY(-4px); box-shadow:0 24px 64px rgba(37,99,235,0.2),0 8px 24px rgba(0,0,0,0.1); }
.ap-tool-launch-card img { width:100%; height:auto; display:block; transition:transform 0.4s ease; }
.ap-tool-launch-card:hover img { transform:scale(1.025); }
.ap-tool-launch-fade { position:absolute; bottom:0; left:0; right:0; height:50%; background:linear-gradient(to bottom,transparent 0%,rgba(255,255,255,0.97) 80%,#fff 100%); pointer-events:none; }
.ap-tool-launch-cta {
  position:absolute; bottom:22px; left:26px; display:inline-flex; align-items:center; gap:10px;
  background:#2563eb; color:#fff; font-size:14px; font-weight:700; font-family:inherit;
  padding:12px 22px; border-radius:10px; border:none; cursor:pointer; z-index:3;
  box-shadow:0 4px 16px rgba(37,99,235,0.35); transition:background 0.2s,transform 0.2s;
}
.ap-tool-launch-cta:hover { background:#1d4ed8; transform:translateY(-2px); }
.ap-tool-launch-cta.billing { background:#16a34a; box-shadow:0 4px 16px rgba(22,163,74,0.35); }
.ap-tool-launch-cta.billing:hover { background:#15803d; }

/* Main */
.ap-main { margin-left:64px; flex:1; min-height:100vh; display:flex; flex-direction:column; }
.ap-topbar {
  background:#fff; border-bottom:1px solid #e2e8f0; height:60px;
  display:flex; align-items:center; justify-content:space-between; padding:0 32px;
  position:sticky; top:0; z-index:100;
}
.ap-topbar-title { font-size:18px; font-weight:800; color:#0f172a; letter-spacing:-0.4px; }
.ap-admin-chip {
  display:flex; align-items:center; gap:10px;
}
.ap-admin-avatar {
  width:34px; height:34px; background:linear-gradient(135deg,#2563eb,#6366f1);
  border-radius:9px; display:flex; align-items:center; justify-content:center;
  font-size:13px; font-weight:800; color:#fff;
}
.ap-admin-info { display:flex; flex-direction:column; }
.ap-admin-name { font-size:13px; font-weight:700; color:#0f172a; line-height:1.3; }
.ap-admin-role { font-size:11px; color:#64748b; font-weight:500; }
.ap-content { padding:32px; flex:1; }

/* Section header */
.ap-section-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; }
.ap-section-title { font-size:22px; font-weight:800; color:#0f172a; letter-spacing:-0.5px; }
.ap-section-sub { font-size:13px; color:#64748b; margin-top:3px; }

/* Card */
.ap-card {
  background:#fff; border:1px solid #e2e8f0; border-radius:16px;
  overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.05);
}

/* Table */
.ap-table { width:100%; border-collapse:collapse; }
.ap-table th {
  text-align:left; font-size:11px; font-weight:700; color:#64748b;
  text-transform:uppercase; letter-spacing:0.8px; padding:12px 20px;
  background:#f8fafc; border-bottom:1px solid #e2e8f0;
}
.ap-table td { padding:14px 20px; border-bottom:1px solid #f1f5f9; font-size:13px; color:#334155; vertical-align:middle; }
.ap-table tr:last-child td { border-bottom:none; }
.ap-table tr:hover td { background:#fafbfc; }
.ap-empty { text-align:center; padding:56px 20px; }
.ap-empty-icon { font-size:40px; margin-bottom:12px; }
.ap-empty-text { font-size:14px; color:#64748b; }

/* User name cell */
.ap-user-cell { display:flex; align-items:center; gap:10px; }
.ap-user-avatar {
  width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center;
  font-size:12px; font-weight:800; color:#fff; flex-shrink:0;
  background:linear-gradient(135deg,#2563eb,#6366f1);
}

/* Tool badges */
.ap-tool-badge {
  display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700;
  padding:3px 10px; border-radius:999px;
}
.ap-tool-badge.monitoring { background:#eff6ff; color:#2563eb; }
.ap-tool-badge.billing    { background:#f0fdf4; color:#16a34a; }
.ap-badge-row { display:flex; gap:5px; flex-wrap:wrap; }

/* Access toggles */
.ap-toggle-row { display:flex; gap:8px; }
.ap-toggle-btn {
  display:inline-flex; align-items:center; gap:6px; padding:6px 14px; border-radius:8px;
  font-size:12px; font-weight:700; border:1.5px solid; cursor:pointer; transition:all 0.18s;
  font-family:inherit;
}
.ap-toggle-btn.on.monitoring  { background:#eff6ff; color:#2563eb; border-color:#bfdbfe; }
.ap-toggle-btn.off.monitoring { background:#f8fafc; color:#94a3b8; border-color:#e2e8f0; }
.ap-toggle-btn.on.billing     { background:#f0fdf4; color:#16a34a; border-color:#bbf7d0; }
.ap-toggle-btn.off.billing    { background:#f8fafc; color:#94a3b8; border-color:#e2e8f0; }
.ap-toggle-btn:hover          { transform:translateY(-1px); }

/* Buttons */
.ap-btn-primary {
  display:inline-flex; align-items:center; gap:7px; background:#2563eb; color:#fff;
  border:none; border-radius:9px; padding:9px 18px; font-size:13px; font-weight:700;
  cursor:pointer; font-family:inherit; transition:all 0.18s;
}
.ap-btn-primary:hover { background:#1d4ed8; transform:translateY(-1px); box-shadow:0 4px 12px rgba(37,99,235,0.3); }
.ap-btn-ghost {
  display:inline-flex; align-items:center; gap:6px; background:transparent; color:#64748b;
  border:1.5px solid #e2e8f0; border-radius:9px; padding:8px 16px; font-size:13px; font-weight:600;
  cursor:pointer; font-family:inherit; transition:all 0.18s;
}
.ap-btn-ghost:hover { border-color:#94a3b8; color:#334155; }
.ap-btn-danger {
  background:transparent; border:none; color:#94a3b8; cursor:pointer; padding:6px; border-radius:6px;
  display:flex; align-items:center; transition:all 0.18s;
}
.ap-btn-danger:hover { color:#dc2626; background:#fee2e2; }

/* Modal */
.ap-modal-overlay {
  position:fixed; inset:0; background:rgba(15,23,42,0.55); backdrop-filter:blur(4px);
  z-index:1000; display:flex; align-items:center; justify-content:center; padding:24px;
}
.ap-modal {
  background:#fff; border-radius:20px; width:100%; max-width:480px;
  box-shadow:0 24px 64px rgba(0,0,0,0.18); animation:apModalIn 0.22s ease;
}
@keyframes apModalIn { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
.ap-modal-header {
  padding:24px 28px 0; display:flex; align-items:center; justify-content:space-between;
}
.ap-modal-title { font-size:18px; font-weight:800; color:#0f172a; letter-spacing:-0.3px; }
.ap-modal-close {
  width:32px; height:32px; border-radius:8px; border:1px solid #e2e8f0; background:#fff;
  cursor:pointer; display:flex; align-items:center; justify-content:center; color:#64748b;
  transition:all 0.15s;
}
.ap-modal-close:hover { background:#f1f5f9; color:#0f172a; }
.ap-modal-body { padding:24px 28px 28px; }

/* Form */
.ap-field { margin-bottom:16px; }
.ap-field label { display:block; font-size:12px; font-weight:700; color:#374151; margin-bottom:6px; letter-spacing:0.2px; }
.ap-input {
  width:100%; padding:10px 13px; border:1.5px solid #e2e8f0; border-radius:9px;
  font-family:inherit; font-size:13px; color:#0f172a; outline:none; transition:border-color 0.18s, box-shadow 0.18s;
  background:#fff;
}
.ap-input:focus { border-color:#2563eb; box-shadow:0 0 0 3px rgba(37,99,235,0.1); }
.ap-input::placeholder { color:#94a3b8; }
.ap-input-wrap { position:relative; }
.ap-input-wrap .ap-input { padding-right:38px; }
.ap-input-eye {
  position:absolute; right:10px; top:50%; transform:translateY(-50%);
  background:none; border:none; cursor:pointer; color:#94a3b8; padding:2px;
  display:flex; align-items:center;
}
.ap-input-eye:hover { color:#334155; }

/* Password type tabs */
.ap-pass-tabs { display:flex; background:#f1f5f9; border-radius:9px; padding:3px; gap:2px; margin-bottom:14px; }
.ap-pass-tab {
  flex:1; padding:7px; border:none; border-radius:7px; font-size:12px; font-weight:600;
  cursor:pointer; font-family:inherit; transition:all 0.18s; color:#64748b; background:transparent;
}
.ap-pass-tab.active { background:#fff; color:#2563eb; box-shadow:0 1px 3px rgba(0,0,0,0.08); }

/* Auto-gen info */
.ap-autogen-info {
  background:#f8fafc; border:1px solid #e2e8f0; border-radius:9px; padding:12px 14px;
  font-size:13px; color:#475569; line-height:1.6;
}
.ap-autogen-info strong { color:#0f172a; }

/* One-time password reveal */
.ap-otp-box {
  background:#f0fdf4; border:1.5px solid #bbf7d0; border-radius:12px; padding:18px 20px; margin-bottom:20px;
}
.ap-otp-label { font-size:11px; font-weight:700; color:#15803d; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:8px; }
.ap-otp-warning { font-size:12px; color:#16a34a; margin-bottom:12px; }
.ap-otp-pass {
  font-family:monospace; font-size:18px; font-weight:800; color:#0f172a; letter-spacing:2px;
  background:#fff; border:1px solid #bbf7d0; border-radius:8px; padding:10px 14px;
  display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:0;
}
.ap-copy-btn {
  display:inline-flex; align-items:center; gap:6px; background:#2563eb; color:#fff;
  border:none; border-radius:7px; padding:7px 13px; font-size:12px; font-weight:700;
  cursor:pointer; font-family:inherit; transition:all 0.15s; white-space:nowrap;
}
.ap-copy-btn:hover { background:#1d4ed8; }
.ap-copy-btn.copied { background:#16a34a; }

/* Form error */
.ap-form-err { font-size:12px; color:#dc2626; background:#fee2e2; border:1px solid #fecaca; border-radius:7px; padding:9px 12px; margin-bottom:12px; }

/* Plan section */
.ap-plan-card {
  background:linear-gradient(135deg,#07111f 0%,#0d2053 60%,#1a3a7a 100%);
  border-radius:16px; padding:32px; color:#fff; margin-bottom:20px; position:relative; overflow:hidden;
}
.ap-plan-card::before {
  content:''; position:absolute; inset:0; pointer-events:none; opacity:0.2;
  background-image:linear-gradient(rgba(59,130,246,0.15) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,0.15) 1px,transparent 1px);
  background-size:32px 32px;
}
.ap-plan-badge { display:inline-flex; align-items:center; background:rgba(37,99,235,0.3); color:#93c5fd; border:1px solid rgba(59,130,246,0.4); padding:4px 12px; border-radius:999px; font-size:11px; font-weight:700; margin-bottom:14px; letter-spacing:0.3px; position:relative; z-index:1; }
.ap-plan-name { font-size:28px; font-weight:800; letter-spacing:-1px; margin-bottom:6px; position:relative; z-index:1; }
.ap-plan-sub { font-size:14px; color:rgba(255,255,255,0.6); position:relative; z-index:1; }
.ap-plan-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-top:24px; position:relative; z-index:1; }
@media(max-width:700px){ .ap-plan-stats { grid-template-columns:repeat(2,1fr); } }
.ap-plan-stat { background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:14px 16px; }
.ap-plan-stat-val { font-size:22px; font-weight:800; color:#fff; margin-bottom:3px; }
.ap-plan-stat-label { font-size:11px; color:rgba(255,255,255,0.55); }

/* Account section */
.ap-account-card { background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:32px; }
.ap-account-avatar { width:64px; height:64px; background:linear-gradient(135deg,#2563eb,#6366f1); border-radius:16px; display:flex; align-items:center; justify-content:center; font-size:24px; font-weight:800; color:#fff; margin-bottom:16px; }
.ap-account-name { font-size:22px; font-weight:800; color:#0f172a; letter-spacing:-0.5px; margin-bottom:4px; }
.ap-account-role { display:inline-flex; align-items:center; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; padding:3px 12px; border-radius:999px; font-size:12px; font-weight:700; margin-bottom:20px; }
.ap-account-info { display:flex; flex-direction:column; gap:12px; }
.ap-account-row { display:flex; align-items:center; gap:12px; padding:12px 16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; }
.ap-account-row-label { font-size:12px; color:#64748b; font-weight:600; width:100px; flex-shrink:0; }
.ap-account-row-val { font-size:13px; color:#0f172a; font-weight:600; }

/* Account edit */
.ap-account-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; }
.ap-account-profile { display:flex; align-items:center; gap:18px; }
.ap-photo-wrap { position:relative; width:72px; height:72px; flex-shrink:0; }
.ap-photo-circle {
  width:72px; height:72px; border-radius:18px; overflow:hidden;
  background:linear-gradient(135deg,#2563eb,#6366f1);
  display:flex; align-items:center; justify-content:center;
  font-size:26px; font-weight:800; color:#fff;
  border:2px solid #e2e8f0;
}
.ap-photo-circle img { width:100%; height:100%; object-fit:cover; display:block; }
.ap-photo-edit-btn {
  position:absolute; bottom:-5px; right:-5px; width:24px; height:24px;
  background:#2563eb; border-radius:50%; border:2px solid #fff;
  display:flex; align-items:center; justify-content:center; cursor:pointer;
  box-shadow:0 1px 4px rgba(0,0,0,0.2);
}
.ap-photo-input { position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; height:100%; }
.ap-edit-name-row { display:flex; gap:8px; align-items:center; margin-bottom:8px; }
.ap-edit-save-row { display:flex; gap:8px; margin-top:16px; }

/* Topbar avatar — photo only, no text */
.ap-topbar-avatar {
  width:38px; height:38px; border-radius:10px; overflow:hidden;
  background:linear-gradient(135deg,#2563eb,#6366f1);
  display:flex; align-items:center; justify-content:center;
  font-size:15px; font-weight:800; color:#fff; flex-shrink:0;
  border:2px solid #e2e8f0; cursor:default;
}
.ap-topbar-avatar img { width:100%; height:100%; object-fit:cover; display:block; }

/* Settings section */
.ap-settings-row { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f1f5f9; }
.ap-settings-row:last-child { border-bottom:none; }
.ap-settings-label { font-size:14px; font-weight:600; color:#0f172a; margin-bottom:2px; }
.ap-settings-sub { font-size:12px; color:#64748b; }
.ap-toggle-switch { position:relative; width:42px; height:24px; }
.ap-toggle-switch input { opacity:0; width:0; height:0; }
.ap-toggle-slider {
  position:absolute; inset:0; background:#cbd5e1; border-radius:999px; cursor:pointer; transition:0.25s;
}
.ap-toggle-slider::before { content:''; position:absolute; width:18px; height:18px; left:3px; top:3px; background:#fff; border-radius:50%; transition:0.25s; }
.ap-toggle-switch input:checked + .ap-toggle-slider { background:#2563eb; }
.ap-toggle-switch input:checked + .ap-toggle-slider::before { transform:translateX(18px); }

/* Stats row at top */
.ap-stats-row { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:28px; }
.ap-stat-card { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:18px 20px; }
.ap-stat-val { font-size:26px; font-weight:800; color:#0f172a; letter-spacing:-1px; line-height:1; margin-bottom:5px; }
.ap-stat-label { font-size:12px; color:#64748b; font-weight:500; }
.ap-stat-card.blue .ap-stat-val { color:#2563eb; }
.ap-stat-card.green .ap-stat-val { color:#16a34a; }
.ap-stat-card.purple .ap-stat-val { color:#7c3aed; }
.ap-stat-card.orange .ap-stat-val { color:#ea580c; }

/* Payment success / error */
.ap-pay-success {
  background:#f0fdf4; border:1.5px solid #86efac; border-radius:14px; padding:20px 24px;
  display:flex; align-items:flex-start; gap:14px; margin-top:20px; animation:apModalIn 0.25s ease;
}
.ap-pay-success-icon { width:36px; height:36px; background:#16a34a; border-radius:9px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.ap-pay-success-title { font-size:14px; font-weight:800; color:#15803d; margin-bottom:4px; }
.ap-pay-success-sub   { font-size:12px; color:#16a34a; }
.ap-pay-success-id    { font-family:monospace; font-size:11px; color:#64748b; margin-top:5px; }
.ap-pay-error {
  background:#fef2f2; border:1.5px solid #fca5a5; border-radius:14px; padding:14px 18px;
  font-size:13px; color:#dc2626; margin-top:16px; font-weight:600;
}

/* Online/Offline status */
.ap-status { display:flex; align-items:center; gap:7px; }
.ap-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
.ap-dot.online  { background:#22c55e; box-shadow:0 0 0 3px #dcfce7; animation:apPulse 2s ease-in-out infinite; }
.ap-dot.offline { background:#cbd5e1; }
@keyframes apPulse { 0%,100%{box-shadow:0 0 0 3px #dcfce7} 50%{box-shadow:0 0 0 5px #bbf7d0} }
.ap-status-label { font-size:12px; font-weight:700; }
.ap-status-label.online  { color:#16a34a; }
.ap-status-label.offline { color:#94a3b8; }

/* Session chip */
.ap-chip { display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:700; padding:3px 9px; border-radius:999px; }
.ap-chip.active   { background:#dcfce7; color:#15803d; }
.ap-chip.inactive { background:#f1f5f9; color:#64748b; }
.ap-chip.never    { color:#cbd5e1; font-size:12px; }

/* Time cell */
.ap-dt { font-size:12px; color:#334155; font-weight:500; }
.ap-dt-sub { font-size:11px; color:#94a3b8; margin-top:1px; }
`;

/* ── Main Component ── */
export default function AdminPortal({ admin, onLogout }) {
  const [section, setSection] = useState("users");
  const [users, setUsers] = useState(getUsers);

  // Admin profile (name + photo) — persisted to localStorage
  const [adminProfile, setAdminProfile] = useState(() => getAdminProfile() || { name: "Administrator", photo: null });
  const [editMode, setEditMode]   = useState(false);
  const [editName, setEditName]   = useState("");
  const [editPhoto, setEditPhoto] = useState(null);

  function openEdit() {
    setEditName(adminProfile.name);
    setEditPhoto(adminProfile.photo);
    setEditMode(true);
  }
  function saveProfile() {
    const updated = { name: editName.trim() || "Administrator", photo: editPhoto };
    saveAdminProfile(updated);
    setAdminProfile(updated);
    setEditMode(false);
  }
  function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setEditPhoto(ev.target.result);
    reader.readAsDataURL(file);
  }

  // Manage Plan — plan cards visibility + bundle toggle (must be at component level)
  const [showPlans,     setShowPlans]     = useState(() => !!getGlobalSettings().currentPlan);
  const [bundleTab,     setBundleTab]     = useState(() => {
    const p = getGlobalSettings().currentPlan;
    return p === "Billing Bundle" ? "billing" : "monitoring";
  });
  const [payState,      setPayState]      = useState({ loading: false, planName: "", error: "", success: "" });
  const [overLimitSecs, setOverLimitSecs] = useState(null); // null = OK, number = countdown

  // Load Razorpay checkout.js once
  useEffect(() => {
    if (document.getElementById("razorpay-checkout-js")) return;
    const s  = document.createElement("script");
    s.id     = "razorpay-checkout-js";
    s.src    = "https://checkout.razorpay.com/v1/checkout.js";
    s.async  = true;
    document.body.appendChild(s);
  }, []);

  async function handleBuyNow(planLabel, amountPaise) {
    setPayState({ loading: true, planName: planLabel, error: "", success: "" });
    try {
      const res = await fetch("/api/create-order", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ amount: amountPaise, currency: "INR", plan_name: planLabel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create order");

      const options = {
        key:         import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount:      data.amount,
        currency:    data.currency,
        name:        "CloudNexus",
        description: planLabel,
        order_id:    data.order_id,
        handler:     async (response) => {
          try {
            const vRes  = await fetch("/api/verify-payment", {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_signature:  response.razorpay_signature,
              }),
            });
            const vData = await vRes.json();
            if (vData.ok) {
              setPayState({ loading: false, planName: planLabel, error: "", success: response.razorpay_payment_id });
              // Persist purchased plan
              const s = JSON.parse(localStorage.getItem("cn_settings") || "{}");
              const purchasedAt = Date.now();
              const updated = { ...s, currentPlan: planLabel, planPaymentId: response.razorpay_payment_id, planPurchasedAt: purchasedAt };
              localStorage.setItem("cn_settings", JSON.stringify(updated));
              setSettings(prev => ({ ...prev, currentPlan: planLabel, planPaymentId: response.razorpay_payment_id, planPurchasedAt: purchasedAt }));
              // Auto-strip tools no longer included in the new plan
              const newAllowed = (PLAN_RESTRICTIONS[planLabel] || { allowedTools: ["monitoring","billing"] }).allowedTools;
              const currentUsers = getUsers();
              const stripped = currentUsers.map(u => ({ ...u, tools: u.tools.filter(t => newAllowed.includes(t)) }));
              saveUsers(stripped);
              setUsers(stripped);
            } else {
              setPayState({ loading: false, planName: planLabel, error: "Payment verification failed. Please contact support.", success: "" });
            }
          } catch {
            setPayState({ loading: false, planName: planLabel, error: "Verification error — please contact support.", success: "" });
          }
        },
        prefill: { name: adminProfile?.name || "Admin", email: admin?.email || "" },
        theme:   { color: "#2563eb" },
        modal:   { ondismiss: () => setPayState(p => ({ ...p, loading: false })) },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (r) => {
        setPayState({ loading: false, planName: planLabel, error: `Payment failed: ${r.error.description}`, success: "" });
      });
      rzp.open();
    } catch (err) {
      setPayState({ loading: false, planName: planLabel, error: err.message, success: "" });
    }
  }

  // Settings toggles — persisted to cn_settings localStorage
  const [settings, setSettings] = useState(() => ({
    emailNotifs:  true,
    activityLogs: true,
    autoExpiry:   true,
    darkMode:     false,
    mfaForUsers:  false,
    ...getGlobalSettings(),
  }));
  function updateSetting(key, val) {
    const next = { ...settings, [key]: val };
    setSettings(next);
    saveGlobalSettings(next);
  }

  // Auto-expand plan grid and sync bundle tab when navigating to plan section
  useEffect(() => {
    if (section === "plan" && settings.currentPlan) {
      setShowPlans(true);
      if (settings.currentPlan === "Billing Bundle") setBundleTab("billing");
      else if (settings.currentPlan === "Monitoring Bundle") setBundleTab("monitoring");
    }
  }, [section, settings.currentPlan]); // eslint-disable-line

  function handleCancelPlan() {
    const planName = settings.currentPlan;
    if (!window.confirm(`Cancel your "${planName}" subscription?\n\nYour account will immediately switch to Developer mode with no usage limits.`)) return;
    const next = { ...settings };
    delete next.currentPlan;
    delete next.planPaymentId;
    delete next.planPurchasedAt;
    saveGlobalSettings(next);
    setSettings(next);
    const restored = getUsers().map(u => ({ ...u, tools: ["monitoring", "billing"] }));
    saveUsers(restored);
    setUsers(restored);
    setPayState({ loading: false, planName: "", error: "", success: "" });
  }

  // Plan-based restrictions
  const PLAN_RESTRICTIONS = {
    "Monitoring Bundle": { allowedTools: ["monitoring"], maxUsers: 1 },
    "Billing Bundle":    { allowedTools: ["billing"],    maxUsers: 1 },
    "Standard Pro":      { allowedTools: ["monitoring", "billing"], maxUsers: 3 },
    "Professional":      { allowedTools: ["monitoring", "billing"], maxUsers: 5 },
    "Enterprise":        { allowedTools: ["monitoring", "billing"], maxUsers: Infinity },
  };
  const planRestrictions = settings.currentPlan
    ? (PLAN_RESTRICTIONS[settings.currentPlan] || { allowedTools: ["monitoring", "billing"], maxUsers: Infinity })
    : { allowedTools: ["monitoring", "billing"], maxUsers: Infinity };

  // Backfill planPurchasedAt + auto-strip disallowed tools on mount
  useEffect(() => {
    if (settings.currentPlan && !settings.planPurchasedAt) {
      const purchasedAt = Date.now();
      const persisted = { ...getGlobalSettings(), planPurchasedAt: purchasedAt };
      saveGlobalSettings(persisted);
      setSettings(prev => ({ ...prev, planPurchasedAt: purchasedAt }));
    }
    // Strip tools that the current plan does not include
    const allowed = planRestrictions.allowedTools;
    const existing = getUsers();
    const needsFix = existing.some(u => u.tools.some(t => !allowed.includes(t)));
    if (needsFix) {
      const fixed = existing.map(u => ({ ...u, tools: u.tools.filter(t => allowed.includes(t)) }));
      saveUsers(fixed);
      setUsers(fixed);
    }
  }, []);

  // Auto-refresh every 30 s so online status and session timers stay current
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Start / cancel over-limit countdown whenever user count or plan changes
  useEffect(() => {
    const { maxUsers } = planRestrictions;
    if (maxUsers !== Infinity && users.length > maxUsers) {
      setOverLimitSecs(prev => prev === null ? 60 : prev); // start only if not already running
    } else {
      setOverLimitSecs(null); // admin resolved it manually — cancel
    }
  }, [users.length, settings.currentPlan]); // eslint-disable-line

  // Countdown ticker + auto-remove at 0
  useEffect(() => {
    if (overLimitSecs === null || overLimitSecs < 0) return;
    if (overLimitSecs === 0) {
      // Time's up — keep the oldest N users, remove the rest
      const { maxUsers } = planRestrictions;
      if (maxUsers !== Infinity && users.length > maxUsers) {
        const sorted = [...users].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        const kept   = sorted.slice(0, maxUsers);
        saveUsers(kept);
        setUsers(kept);
      }
      setOverLimitSecs(null);
      return;
    }
    const id = setTimeout(() => setOverLimitSecs(s => (s !== null ? s - 1 : null)), 1000);
    return () => clearTimeout(id);
  }, [overLimitSecs]); // eslint-disable-line

  // Create user modal state
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", passType: "auto", password: "", showPass: false });
  const [formErr, setFormErr] = useState("");
  const [oneTimePass, setOneTimePass] = useState("");
  const [copied, setCopied] = useState(false);

  const updateUsers = (list) => { saveUsers(list); setUsers(list); };

  /* ── Create user ── */
  function handleCreate() {
    if (!form.name.trim() || !form.email.trim()) { setFormErr("Name and email are required."); return; }
    if (!/\S+@\S+\.\S+/.test(form.email)) { setFormErr("Enter a valid email address."); return; }

    // Domain must match the admin's own email domain
    const adminDomain = admin?.email?.split("@")[1]?.toLowerCase();
    const userDomain  = form.email.split("@")[1]?.toLowerCase();
    if (adminDomain && userDomain !== adminDomain) {
      setFormErr(`Only @${adminDomain} email addresses are allowed in this organisation.`);
      return;
    }

    // Enforce plan user limit
    const { maxUsers } = planRestrictions;
    if (users.length >= maxUsers) {
      const planName = settings.currentPlan || "your current plan";
      setFormErr(`User limit reached. ${planName} allows a maximum of ${maxUsers} user${maxUsers === 1 ? "" : "s"}. Upgrade your plan to add more.`);
      return;
    }

    if (form.passType === "manual" && !form.password) { setFormErr("Please enter a password."); return; }
    if (users.find(u => u.email.toLowerCase() === form.email.toLowerCase())) { setFormErr("A user with this email already exists."); return; }

    const pwd = form.passType === "auto" ? genPassword() : form.password;
    const newUser = { id: "u_" + Date.now(), name: form.name.trim(), email: form.email.trim(), password: pwd, tools: planRestrictions.allowedTools, createdAt: Date.now() };
    updateUsers([...users, newUser]);
    setFormErr("");

    if (form.passType === "auto") {
      setOneTimePass(pwd);
    } else {
      closeModal();
    }
  }

  function closeModal() {
    setShowModal(false);
    setForm({ name: "", email: "", passType: "auto", password: "", showPass: false });
    setFormErr("");
    setOneTimePass("");
    setCopied(false);
  }

  function copyPass() {
    navigator.clipboard.writeText(oneTimePass).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function deleteUser(id) {
    if (window.confirm("Delete this user? They will lose access immediately.")) {
      updateUsers(users.filter(u => u.id !== id));
    }
  }

  function toggleTool(userId, tool) {
    if (!planRestrictions.allowedTools.includes(tool)) return; // blocked by plan
    updateUsers(users.map(u => {
      if (u.id !== userId) return u;
      const tools = u.tools.includes(tool) ? u.tools.filter(t => t !== tool) : [...u.tools, tool];
      return { ...u, tools };
    }));
  }

  /* ── Nav items ── */
  const navItems = [
    { id: "users",    label: "Users",         Icon: UsersIcon },
    { id: "access",   label: "Manage Access", Icon: AccessIcon },
    { id: "plan",     label: "Manage Plan",   Icon: PlanIcon },
    { id: "account",  label: "Account",       Icon: AccountIcon },
    { id: "settings", label: "Settings",      Icon: SettingsIcon },
  ];

  const sectionTitles = {
    "tool-monitoring": "Monitoring",
    "tool-billing":    "Billing",
    users:    "Users",
    access:   "Manage Access",
    plan:     "Manage Plan",
    account:  "Account",
    settings: "Settings",
  };

  /* ── Section renderers ── */
  function renderToolSection(toolKey) {
    const isMonitoring = toolKey === "monitoring";
    const toolName   = isMonitoring ? "Monitoring" : "Billing";
    const toolUrl    = isMonitoring ? "http://localhost:3007" : "http://localhost:3008";
    const toolImg    = isMonitoring ? "/images/card-monitoring.png" : "/images/card-billing.png";
    const toolDesc   = isMonitoring
      ? "Real-time infrastructure monitoring, live alerts, server health dashboards, and network analytics."
      : "Cloud cost analytics, invoice management, budget forecasting, and spend optimisation.";
    const accentColor = isMonitoring ? "#2563eb" : "#16a34a";
    const bgColor     = isMonitoring ? "#eff6ff" : "#f0fdf4";
    const borderColor = isMonitoring ? "#bfdbfe" : "#bbf7d0";

    return (
      <>
        {/* Info row */}
        <div className="ap-card" style={{marginBottom:20,display:"flex",alignItems:"center",gap:18,padding:"20px 26px"}}>
          <div style={{width:46,height:46,borderRadius:12,background:bgColor,border:`1.5px solid ${borderColor}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            {isMonitoring
              ? <MonitoringNavIcon />
              : <BillingNavIcon />
            }
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:700,color:"#0f172a",marginBottom:3}}>{toolName}</div>
            <div style={{fontSize:13,color:"#64748b",lineHeight:1.6}}>{toolDesc}</div>
          </div>
          <button
            className="ap-btn-primary"
            style={{background:accentColor,flexShrink:0}}
            onClick={() => window.open(toolUrl, "_blank")}
          >
            Open {toolName} <ArrowRightIcon />
          </button>
        </div>

        {/* Card preview — same as hub */}
        <div
          className="ap-tool-launch-card"
          onClick={() => window.open(toolUrl, "_blank")}
          title={`Open ${toolName}`}
        >
          <img src={toolImg} alt={toolName} />
          <div className="ap-tool-launch-fade" />
          <button className={`ap-tool-launch-cta${isMonitoring ? "" : " billing"}`}>
            Go to {toolName} <ArrowRightIcon />
          </button>
        </div>
      </>
    );
  }

  function renderUsers() {
    const activity   = getActivity(); // fresh read every render (tick forces re-render every 30s)
    const monitoring = users.filter(u => u.tools.includes("monitoring")).length;
    const billing    = users.filter(u => u.tools.includes("billing")).length;
    const onlineNow  = users.filter(u => isOnline(activity[u.email])).length;

    return (
      <>
        <div className="ap-stats-row">
          <div className="ap-stat-card blue"><div className="ap-stat-val">{users.length}</div><div className="ap-stat-label">Total Users</div></div>
          <div className="ap-stat-card" style={{borderLeft:"3px solid #22c55e"}}>
            <div className="ap-stat-val" style={{color:"#16a34a"}}>{onlineNow}</div>
            <div className="ap-stat-label">Online Now</div>
          </div>
          <div className="ap-stat-card green"><div className="ap-stat-val">{monitoring}</div><div className="ap-stat-label">Monitoring Access</div></div>
          <div className="ap-stat-card purple"><div className="ap-stat-val">{billing}</div><div className="ap-stat-label">Billing Access</div></div>
        </div>

        <div className="ap-card">
          {users.length === 0 ? (
            <div className="ap-empty">
              <div className="ap-empty-icon">👥</div>
              <div className="ap-empty-text">No users yet. Create your first user to get started.</div>
            </div>
          ) : (
            <table className="ap-table">
              <thead><tr>
                <th>User</th><th>Status</th><th>Last Login</th><th>Session</th><th>Access</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {users.map(u => {
                  const act     = activity[u.email];
                  const online  = isOnline(act);
                  const activeDuration = online && act?.sessionStart
                    ? Date.now() - act.sessionStart : null;
                  const lastDuration = act?.lastSessionDuration || null;
                  const photo   = getUserPhoto(u.email);

                  return (
                    <tr key={u.id}>
                      {/* User */}
                      <td>
                        <div className="ap-user-cell">
                          <div className="ap-user-avatar" style={{
                            background: photo ? "transparent" : online
                              ? "linear-gradient(135deg,#16a34a,#22c55e)"
                              : "linear-gradient(135deg,#94a3b8,#64748b)",
                            overflow: "hidden", padding: 0,
                          }}>
                            {photo
                              ? <img src={photo} alt={u.name} style={{width:"100%",height:"100%",objectFit:"cover",display:"block",borderRadius:8}} />
                              : u.name[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{fontWeight:700,color:"#0f172a",fontSize:13}}>{u.name}</div>
                            <div style={{fontSize:11,color:"#94a3b8"}}>{u.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td>
                        <div className="ap-status">
                          <span className={`ap-dot ${online ? "online" : "offline"}`} />
                          <span className={`ap-status-label ${online ? "online" : "offline"}`}>
                            {online ? "Online" : "Offline"}
                          </span>
                        </div>
                      </td>

                      {/* Last Login */}
                      <td>
                        {act?.lastLogin ? (
                          <>
                            <div className="ap-dt">{fmtDateTime(act.lastLogin)}</div>
                            {act.totalSessions > 0 && (
                              <div className="ap-dt-sub">{act.totalSessions} session{act.totalSessions !== 1 ? "s" : ""} total</div>
                            )}
                          </>
                        ) : (
                          <span style={{fontSize:12,color:"#cbd5e1"}}>Never logged in</span>
                        )}
                      </td>

                      {/* Session duration */}
                      <td>
                        {activeDuration ? (
                          <span className="ap-chip active">● Active {fmtDuration(activeDuration)}</span>
                        ) : lastDuration ? (
                          <span className="ap-chip inactive">Last: {fmtDuration(lastDuration)}</span>
                        ) : (
                          <span className="ap-chip never">—</span>
                        )}
                      </td>

                      {/* Access */}
                      <td>
                        <div className="ap-badge-row">
                          {u.tools.includes("monitoring") && <span className="ap-tool-badge monitoring">Monitoring</span>}
                          {u.tools.includes("billing")    && <span className="ap-tool-badge billing">Billing</span>}
                          {u.tools.length === 0 && <span style={{fontSize:12,color:"#94a3b8"}}>No access</span>}
                        </div>
                      </td>

                      {/* Actions */}
                      <td>
                        <button className="ap-btn-danger" onClick={() => deleteUser(u.id)} title="Delete user">
                          <TrashIcon />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </>
    );
  }

  function renderAccess() {
    const { allowedTools } = planRestrictions;
    const monAllowed  = allowedTools.includes("monitoring");
    const billAllowed = allowedTools.includes("billing");

    return (
      <div className="ap-card">
        {/* Plan restriction banner */}
        {(!monAllowed || !billAllowed) && (
          <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:"10px 16px",marginBottom:18,display:"flex",alignItems:"center",gap:10,fontSize:13,color:"#92400e"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>
              Your <strong>{settings.currentPlan}</strong> plan only includes access to the&nbsp;
              <strong>{monAllowed ? "Monitoring" : "Billing"}</strong> module.
              The <strong>{monAllowed ? "Billing" : "Monitoring"}</strong> column is locked — upgrade your plan to unlock it.
            </span>
          </div>
        )}
        {users.length === 0 ? (
          <div className="ap-empty">
            <div className="ap-empty-icon">🔐</div>
            <div className="ap-empty-text">No users yet. Create users first to manage their access.</div>
          </div>
        ) : (
          <table className="ap-table">
            <thead><tr>
              <th>User</th><th>Email</th>
              <th>
                Monitoring
                {!monAllowed && <span style={{marginLeft:6,fontSize:10,color:"#ef4444",background:"#fee2e2",padding:"1px 6px",borderRadius:4,fontWeight:700}}>LOCKED</span>}
              </th>
              <th>
                Billing
                {!billAllowed && <span style={{marginLeft:6,fontSize:10,color:"#ef4444",background:"#fee2e2",padding:"1px 6px",borderRadius:4,fontWeight:700}}>LOCKED</span>}
              </th>
            </tr></thead>
            <tbody>
              {users.map(u => {
                const photo = getUserPhoto(u.email);
                return (
                <tr key={u.id}>
                  <td><div className="ap-user-cell">
                    <div className="ap-user-avatar" style={{overflow:"hidden",padding:0,background:photo?"transparent":undefined}}>
                      {photo
                        ? <img src={photo} alt={u.name} style={{width:"100%",height:"100%",objectFit:"cover",display:"block",borderRadius:8}} />
                        : u.name[0].toUpperCase()}
                    </div>
                    <span style={{fontWeight:600,color:"#0f172a"}}>{u.name}</span>
                  </div></td>
                  <td style={{color:"#64748b"}}>{u.email}</td>
                  <td>
                    {monAllowed ? (
                      <button className={`ap-toggle-btn ${u.tools.includes("monitoring") ? "on" : "off"} monitoring`} onClick={() => toggleTool(u.id, "monitoring")}>
                        {u.tools.includes("monitoring") ? <><CheckIcon /> Enabled</> : "Disabled"}
                      </button>
                    ) : (
                      <span style={{fontSize:12,color:"#94a3b8",display:"inline-flex",alignItems:"center",gap:5,padding:"5px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,background:"#f8fafc"}}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        Not in Plan
                      </span>
                    )}
                  </td>
                  <td>
                    {billAllowed ? (
                      <button className={`ap-toggle-btn ${u.tools.includes("billing") ? "on" : "off"} billing`} onClick={() => toggleTool(u.id, "billing")}>
                        {u.tools.includes("billing") ? <><CheckIcon /> Enabled</> : "Disabled"}
                      </button>
                    ) : (
                      <span style={{fontSize:12,color:"#94a3b8",display:"inline-flex",alignItems:"center",gap:5,padding:"5px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,background:"#f8fafc"}}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        Not in Plan
                      </span>
                    )}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  function renderPlan() {
    const PLAN_META = {
      "Monitoring Bundle": { userLimit: "2",         modules: 1, desc: "Monitoring module for 1 Admin + 1 User — billed annually per user." },
      "Billing Bundle":    { userLimit: "2",         modules: 1, desc: "Billing module for 1 Admin + 1 User — billed annually per user." },
      "Standard Pro":      { userLimit: "4",         modules: 2, desc: "Full platform access with monitoring & billing for growing teams." },
      "Professional":      { userLimit: "5",         modules: 2, desc: "Advanced analytics and multi-user access across all platform modules." },
      "Enterprise":        { userLimit: "Unlimited", modules: 2, desc: "Unlimited scale, custom integrations, and 24/7 priority support." },
    };
    const DEFAULT_META = { userLimit: "∞", modules: 2, desc: "Full platform access with no user cap — ideal for testing and internal rollout." };

    const activePlan = settings.currentPlan || null;
    const meta       = activePlan ? (PLAN_META[activePlan] || DEFAULT_META) : DEFAULT_META;
    const planName   = activePlan || "Developer / No Limit";

    let daysLeft = null;
    if (settings.planPurchasedAt) {
      daysLeft = Math.max(0, 365 - Math.floor((Date.now() - settings.planPurchasedAt) / 86400000));
    }

    const planFeatures = {
      mon:        ["1 Admin + 1 User", "Monitoring Module Access", "Real-time Alerts & Dashboards", "Server & Network Health", "Email Support"],
      bill:       ["1 Admin + 1 User", "Billing Module Access", "Cost Analytics & Forecasting", "Invoice & Budget Management", "Email Support"],
      standard:   ["2 Admins Included", "Monitoring & Billing Access", "Full Dashboard Suite", "Custom Alert Policies", "Priority Email Support"],
      pro:        ["2 Admins + 3 Users per Module", "Full Platform Access", "Advanced Analytics & Reports", "Dedicated Account Manager", "API Access & Integrations"],
      enterprise: ["Unlimited Users", "Full Platform Access", "Custom Integrations & SSO", "24/7 Priority Support", "SLA Guarantee"],
    };

    return (
      <>
        {/* Current active plan */}
        <div className="ap-plan-card">
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",position:"relative",zIndex:1}}>
            <div>
              <div className="ap-plan-badge" style={!activePlan ? {background:"rgba(100,116,139,0.3)",color:"#94a3b8",borderColor:"rgba(100,116,139,0.3)"} : {}}>
                {activePlan ? "Current Plan" : "Developer Mode"}
              </div>
              <div className="ap-plan-name">{planName}</div>
              <div className="ap-plan-sub">{meta.desc}</div>
              {activePlan && settings.planPaymentId && (
                <div style={{marginTop:8,fontSize:11,color:"rgba(255,255,255,0.4)",fontFamily:"monospace"}}>
                  Payment ID: {settings.planPaymentId}
                </div>
              )}
            </div>
            {activePlan && (
              <button
                onClick={handleCancelPlan}
                style={{
                  flexShrink:0,marginLeft:16,padding:"8px 16px",
                  background:"rgba(239,68,68,0.15)",color:"#fca5a5",
                  border:"1.5px solid rgba(239,68,68,0.35)",borderRadius:9,
                  fontSize:13,fontWeight:700,cursor:"pointer",
                  fontFamily:"inherit",transition:"all 0.18s",whiteSpace:"nowrap"
                }}
                onMouseEnter={e=>{e.currentTarget.style.background="rgba(239,68,68,0.28)";e.currentTarget.style.color="#f87171";}}
                onMouseLeave={e=>{e.currentTarget.style.background="rgba(239,68,68,0.15)";e.currentTarget.style.color="#fca5a5";}}
              >
                Cancel Plan
              </button>
            )}
          </div>
          <div className="ap-plan-stats">
            <div className="ap-plan-stat">
              <div className="ap-plan-stat-val">{meta.userLimit}</div>
              <div className="ap-plan-stat-label">User Limit</div>
            </div>
            <div className="ap-plan-stat">
              <div className="ap-plan-stat-val">{meta.modules}</div>
              <div className="ap-plan-stat-label">Modules Active</div>
            </div>
            <div className="ap-plan-stat">
              <div className="ap-plan-stat-val" style={daysLeft !== null && daysLeft <= 30 ? {color:"#fbbf24"} : {}}>
                {daysLeft !== null ? (daysLeft === 0 ? "Expired" : `${daysLeft}`) : "—"}
              </div>
              <div className="ap-plan-stat-label">Days to Renewal</div>
            </div>
            <div className="ap-plan-stat">
              <div className="ap-plan-stat-val" style={{color: daysLeft === 0 ? "#f87171" : activePlan ? "#4ade80" : "#94a3b8"}}>
                {daysLeft === 0 ? "Expired" : activePlan ? "Active" : "Dev Mode"}
              </div>
              <div className="ap-plan-stat-label">Status</div>
            </div>
          </div>
        </div>

        {/* Toggle row */}
        <div className="ap-card" style={{padding:"22px 28px"}}>
          <div style={{fontSize:15,fontWeight:700,color:"#0f172a",marginBottom:6}}>Available Plans</div>
          <div style={{fontSize:13,color:"#64748b",lineHeight:1.6}}>
            {showPlans
              ? "Select a plan below and click Buy Now to upgrade."
              : "View all subscription plans and upgrade directly from here."}
          </div>
          <div style={{marginTop:14}}>
            <button className="ap-btn-primary" onClick={() => setShowPlans(p => !p)}>
              {showPlans ? "Hide Plans" : "View Plans"}
            </button>
          </div>
        </div>

        {/* Pricing cards — same cards as landing page */}
        {showPlans && (() => {
          const isBundleActive = activePlan === (bundleTab === "monitoring" ? "Monitoring Bundle" : "Billing Bundle");
          const activeCardStyle = { outline:"2.5px solid #16a34a", outlineOffset:"0px", boxShadow:"0 0 0 4px rgba(22,163,74,0.12), 0 8px 32px rgba(22,163,74,0.12)" };
          const activeBadge = (
            <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"#dcfce7",color:"#15803d",border:"1.5px solid #86efac",padding:"4px 12px",borderRadius:999,fontSize:12,fontWeight:800,marginBottom:10}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Current Plan
            </div>
          );
          const cancelBtn = (
            <button
              className="btn btn-lg pc-btn"
              onClick={handleCancelPlan}
              style={{background:"#fef2f2",color:"#dc2626",border:"1.5px solid #fecaca",fontWeight:700,cursor:"pointer"}}
            >
              Cancel Plan
            </button>
          );
          return (
            <div className="pricing-grid" style={{marginTop:4}}>

              {/* Bundle — Monitoring / Billing toggle */}
              <div className="pricing-card bundle-card" style={isBundleActive ? activeCardStyle : {}}>
                <div className="bundle-toggle">
                  <button className={`bundle-tab ${bundleTab === "monitoring" ? "active" : ""}`} onClick={() => setBundleTab("monitoring")}>Monitoring</button>
                  <button className={`bundle-tab ${bundleTab === "billing"    ? "active" : ""}`} onClick={() => setBundleTab("billing")}>Billing</button>
                </div>
                <div key={bundleTab} className="bundle-plan-content">
                  {isBundleActive && activeBadge}
                  <div className="pc-name">{bundleTab === "monitoring" ? "Monitoring Bundle" : "Billing Bundle"}</div>
                  <div className="pc-price-wrap">
                    <span className="pc-price">₹10,000</span>
                    <span className="pc-period">per user / year</span>
                  </div>
                  <p className="pc-desc">
                    {bundleTab === "monitoring"
                      ? "Perfect for teams focused on infrastructure health, real-time alerting, and server analytics."
                      : "Ideal for teams tracking cloud costs, managing invoices, and optimizing spend."}
                  </p>
                  <ul className="pc-features">
                    {planFeatures[bundleTab === "monitoring" ? "mon" : "bill"].map(f => (
                      <li key={f}><CheckIcon />{f}</li>
                    ))}
                  </ul>
                  {isBundleActive ? cancelBtn : payState.success && payState.planName.includes("Bundle") ? (
                    <div style={{marginTop:"auto",background:"#f0fdf4",border:"1px solid #86efac",borderRadius:10,padding:"12px 14px",fontSize:13,color:"#15803d",fontWeight:700}}>
                      ✓ Payment confirmed!
                      <div style={{fontSize:11,color:"#16a34a",fontWeight:500,marginTop:3}}>ID: {payState.success}</div>
                    </div>
                  ) : (
                    <button
                      className="btn btn-secondary btn-lg pc-btn"
                      onClick={() => handleBuyNow(`${bundleTab === "monitoring" ? "Monitoring" : "Billing"} Bundle`, 1000000)}
                      disabled={payState.loading}
                      style={{opacity: payState.loading ? 0.7 : 1}}
                    >
                      {payState.loading && payState.planName.includes("Bundle") ? "Opening…" : "Buy Now  ₹10,000"}
                    </button>
                  )}
                </div>
              </div>

              {/* Standard Pro */}
              <div className="pricing-card" style={activePlan === "Standard Pro" ? activeCardStyle : {}}>
                {activePlan === "Standard Pro" && activeBadge}
                <div className="pc-name">Standard Pro</div>
                <div className="pc-price-wrap">
                  <span className="pc-price pc-contact">Contact Us</span>
                </div>
                <p className="pc-desc">For growing teams that need full access to both monitoring and billing in one plan.</p>
                <ul className="pc-features">
                  {planFeatures.standard.map(f => <li key={f}><CheckIcon />{f}</li>)}
                </ul>
                {activePlan === "Standard Pro" ? cancelBtn : (
                  <button className="btn btn-secondary btn-lg pc-btn" onClick={() => window.open("http://localhost:3006/#contact","_blank")}>
                    Contact Sales
                  </button>
                )}
              </div>

              {/* Professional — highlighted */}
              <div className="pricing-card pricing-highlight" style={activePlan === "Professional" ? activeCardStyle : {}}>
                {activePlan === "Professional" ? activeBadge : <div className="pc-badge">Most Popular</div>}
                <div className="pc-name">Professional</div>
                <div className="pc-price-wrap">
                  <span className="pc-price pc-contact">Contact Us</span>
                </div>
                <p className="pc-desc">Scale your team with multi-user access and advanced analytics across all modules.</p>
                <ul className="pc-features">
                  {planFeatures.pro.map(f => <li key={f}><CheckIcon />{f}</li>)}
                </ul>
                {activePlan === "Professional" ? cancelBtn : (
                  <button className="btn btn-primary btn-lg pc-btn" onClick={() => window.open("http://localhost:3006/#contact","_blank")}>
                    Contact Sales
                  </button>
                )}
              </div>

              {/* Enterprise */}
              <div className="pricing-card" style={activePlan === "Enterprise" ? activeCardStyle : {}}>
                {activePlan === "Enterprise" && activeBadge}
                <div className="pc-name">Enterprise</div>
                <div className="pc-price-wrap">
                  <span className="pc-price pc-contact">Contact Us</span>
                </div>
                <p className="pc-desc">Unlimited scale, custom integrations, and white-glove support for large organizations.</p>
                <ul className="pc-features">
                  {planFeatures.enterprise.map(f => <li key={f}><CheckIcon />{f}</li>)}
                </ul>
                {activePlan === "Enterprise" ? cancelBtn : (
                  <button className="btn btn-secondary btn-lg pc-btn" onClick={() => window.open("http://localhost:3006/#contact","_blank")}>
                    Contact Sales
                  </button>
                )}
              </div>

            </div>
          );
        })()}

        {/* Payment error banner */}
        {payState.error && (
          <div className="ap-pay-error">⚠ {payState.error}</div>
        )}

        {/* Payment success banner (bundle) */}
        {payState.success && (
          <div className="ap-pay-success">
            <div className="ap-pay-success-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div>
              <div className="ap-pay-success-title">Payment Successful — {payState.planName} Activated</div>
              <div className="ap-pay-success-sub">Your subscription is now active. The team will reach out to set up your account.</div>
              <div className="ap-pay-success-id">Payment ID: {payState.success}</div>
            </div>
          </div>
        )}
      </>
    );
  }

  function renderAccount() {
    const emailDomain = admin?.email?.split("@")[1] || "core5.co.in";
    const orgName     = emailDomain.split(".")[0].charAt(0).toUpperCase() + emailDomain.split(".")[0].slice(1);

    return (
      <div className="ap-account-card">
        <div className="ap-account-header">
          <div className="ap-account-profile">
            {/* Avatar / photo */}
            <div className="ap-photo-wrap">
              <div className="ap-photo-circle">
                {(editMode ? editPhoto : adminProfile.photo)
                  ? <img src={editMode ? editPhoto : adminProfile.photo} alt="profile" />
                  : (editMode ? editName[0]?.toUpperCase() : adminProfile.name[0]?.toUpperCase()) || "A"
                }
              </div>
              {editMode && (
                <label className="ap-photo-edit-btn" title="Change photo">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
                  <input type="file" accept="image/*" className="ap-photo-input" onChange={handlePhotoChange} />
                </label>
              )}
            </div>

            {/* Name + role */}
            <div>
              {editMode ? (
                <input
                  className="ap-input"
                  style={{fontSize:16,fontWeight:700,marginBottom:4,width:220}}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Display name"
                  autoFocus
                />
              ) : (
                <div className="ap-account-name" style={{marginBottom:0}}>{adminProfile.name}</div>
              )}
              <div className="ap-account-role" style={{marginTop:6}}>Super Admin</div>
            </div>
          </div>

          {/* Edit / Save / Cancel buttons */}
          {editMode ? (
            <div style={{display:"flex",gap:8,alignSelf:"flex-start"}}>
              <button className="ap-btn-primary" style={{padding:"7px 16px"}} onClick={saveProfile}>Save</button>
              <button className="ap-btn-ghost"   style={{padding:"7px 14px"}} onClick={() => setEditMode(false)}>Cancel</button>
            </div>
          ) : (
            <button className="ap-btn-ghost" style={{padding:"7px 16px",alignSelf:"flex-start"}} onClick={openEdit}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:5}}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
              Edit Profile
            </button>
          )}
        </div>

        <div className="ap-account-info">
          {[
            ["Full Name",     adminProfile.name],
            ["Email",         admin?.email || "admin@core5.co.in"],
            ["Role",          "Super Admin"],
            ["Access",        "Full Platform"],
            ["Organisation",  orgName],
          ].map(([l, v]) => (
            <div key={l} className="ap-account-row">
              <span className="ap-account-row-label">{l}</span>
              <span className="ap-account-row-val">{v}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderSettings() {
    const items = [
      { key: "emailNotifs",  label: "Email Notifications",  sub: "Receive alerts and reports via email" },
      { key: "activityLogs", label: "User Activity Logs",    sub: "Track all user logins and actions" },
      { key: "autoExpiry",   label: "Auto Session Expiry",   sub: "Sessions expire after 2 days of inactivity" },
      { key: "darkMode",     label: "Dark Mode",             sub: "Switch the admin portal to dark theme" },
    ];
    return (
      <div className="ap-card">
        {items.map(({ key, label, sub }) => (
          <div key={key} className="ap-settings-row">
            <div>
              <div className="ap-settings-label">{label}</div>
              <div className="ap-settings-sub">{sub}</div>
            </div>
            <label className="ap-toggle-switch">
              <input type="checkbox" checked={!!settings[key]} onChange={e => updateSetting(key, e.target.checked)} />
              <span className="ap-toggle-slider" />
            </label>
          </div>
        ))}

        {/* MFA row — special styling */}
        <div className="ap-settings-row" style={{background: settings.mfaForUsers ? "#f0fdf4" : "transparent", borderRadius: settings.mfaForUsers ? "0 0 16px 16px" : 0, transition:"background 0.3s"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:36,height:36,borderRadius:9,background: settings.mfaForUsers ? "#dcfce7" : "#f1f5f9", display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"background 0.3s"}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={settings.mfaForUsers ? "#16a34a" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>
                <circle cx="12" cy="16" r="1" fill={settings.mfaForUsers ? "#16a34a" : "#94a3b8"}/>
              </svg>
            </div>
            <div>
              <div className="ap-settings-label" style={{color: settings.mfaForUsers ? "#15803d" : "#0f172a"}}>
                MFA for All Users
                {settings.mfaForUsers && <span style={{marginLeft:8,fontSize:11,fontWeight:700,background:"#16a34a",color:"#fff",padding:"1px 7px",borderRadius:999}}>ACTIVE</span>}
              </div>
              <div className="ap-settings-sub">
                {settings.mfaForUsers
                  ? "All users must scan a QR code on first login and enter a 6-digit code on every login."
                  : "Require users to verify identity with an authenticator app on every login."}
              </div>
            </div>
          </div>
          <label className="ap-toggle-switch">
            <input type="checkbox" checked={!!settings.mfaForUsers} onChange={e => updateSetting("mfaForUsers", e.target.checked)} />
            <span className="ap-toggle-slider" />
          </label>
        </div>
      </div>
    );
  }

  const sectionMap = {
    "tool-monitoring": () => renderToolSection("monitoring"),
    "tool-billing":    () => renderToolSection("billing"),
    users:    renderUsers,
    access:   renderAccess,
    plan:     renderPlan,
    account:  renderAccount,
    settings: renderSettings,
  };

  return (
    <>
      <style>{css}</style>
      <div className="ap-wrap">

        {/* Sidebar */}
        <aside className="ap-sidebar">
          <button className="ap-logo-btn" title="CloudNexus"><CloudIcon /></button>
          <nav className="ap-nav">
            {/* ── Tool shortcuts (plan-gated) ── */}
            {planRestrictions.allowedTools.includes("monitoring") && (
              <button
                className={`ap-nav-btn tool-monitoring ${section === "tool-monitoring" ? "ap-active" : ""}`}
                onClick={() => setSection("tool-monitoring")}
              >
                <MonitoringNavIcon />
                <span className="ap-nav-tip">Monitoring</span>
              </button>
            )}
            {planRestrictions.allowedTools.includes("billing") && (
              <button
                className={`ap-nav-btn tool-billing ${section === "tool-billing" ? "ap-active" : ""}`}
                onClick={() => setSection("tool-billing")}
              >
                <BillingNavIcon />
                <span className="ap-nav-tip">Billing</span>
              </button>
            )}
            {/* Divider between tools and admin nav */}
            {planRestrictions.allowedTools.length > 0 && (
              <div className="ap-nav-divider" />
            )}

            {/* ── Admin nav items ── */}
            {navItems.map(({ id, label, Icon }) => (
              <button key={id} className={`ap-nav-btn ${section === id ? "ap-active" : ""}`} onClick={() => setSection(id)}>
                <Icon />
                <span className="ap-nav-tip">{label}</span>
              </button>
            ))}
          </nav>
          <div className="ap-logout">
            <button className="ap-nav-btn" onClick={onLogout}>
              <LogoutIcon />
              <span className="ap-nav-tip">Sign Out</span>
            </button>
          </div>
        </aside>

        {/* Main */}
        <div className="ap-main">
          <div className="ap-topbar">
            <div>
              <div className="ap-topbar-title">{sectionTitles[section]}</div>
            </div>
            <div className="ap-topbar-avatar" title={adminProfile.name}>
              {adminProfile.photo
                ? <img src={adminProfile.photo} alt="profile" />
                : adminProfile.name[0]?.toUpperCase() || "A"
              }
            </div>
          </div>

          <div className="ap-content">
            <div className="ap-section-head">
              <div>
                <div className="ap-section-title">{sectionTitles[section]}</div>
                {section === "tool-monitoring" && <div className="ap-section-sub">Included in your <strong>{settings.currentPlan || "plan"}</strong> — opens in a new tab.</div>}
                {section === "tool-billing"    && <div className="ap-section-sub">Included in your <strong>{settings.currentPlan || "plan"}</strong> — opens in a new tab.</div>}
                {section === "users"  && (
                  <div className="ap-section-sub">
                    {users.length} / {planRestrictions.maxUsers === Infinity ? "∞" : planRestrictions.maxUsers} users
                    {" — "}{settings.currentPlan || "Developer plan"}
                  </div>
                )}
                {section === "access" && <div className="ap-section-sub">Toggle tool access per user. Changes apply instantly on next login.</div>}
              </div>
              {section === "users" && (
                <button
                  className="ap-btn-primary"
                  onClick={() => setShowModal(true)}
                  disabled={planRestrictions.maxUsers !== Infinity && users.length >= planRestrictions.maxUsers}
                  title={planRestrictions.maxUsers !== Infinity && users.length >= planRestrictions.maxUsers
                    ? `User limit reached (${planRestrictions.maxUsers}/${planRestrictions.maxUsers}). Upgrade your plan to add more.`
                    : "Add a new user"}
                  style={planRestrictions.maxUsers !== Infinity && users.length >= planRestrictions.maxUsers
                    ? {opacity:0.5, cursor:"not-allowed"} : {}}
                >
                  <PlusIcon /> Add User
                </button>
              )}
            </div>
            {/* ── Over-limit warning banner ── */}
            {overLimitSecs !== null && planRestrictions.maxUsers !== Infinity && (
              <div style={{
                background:"linear-gradient(135deg,#7f1d1d,#991b1b)",
                border:"1px solid #ef4444",
                borderRadius:14,
                padding:"18px 22px",
                marginBottom:24,
                display:"flex",
                alignItems:"center",
                justifyContent:"space-between",
                gap:16,
                boxShadow:"0 4px 24px rgba(239,68,68,0.25)",
                animation:"apModalIn 0.3s ease",
              }}>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  {/* Countdown ring */}
                  <div style={{
                    width:52, height:52, borderRadius:"50%", flexShrink:0,
                    background:"rgba(0,0,0,0.3)", border:"3px solid #ef4444",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    flexDirection:"column",
                  }}>
                    <div style={{fontSize:18,fontWeight:900,color:"#fca5a5",lineHeight:1}}>{overLimitSecs}</div>
                    <div style={{fontSize:9,color:"rgba(255,255,255,0.6)",fontWeight:600,letterSpacing:0.5}}>SEC</div>
                  </div>
                  <div>
                    <div style={{fontSize:14,fontWeight:800,color:"#fff",marginBottom:3}}>
                      User Limit Exceeded — Action Required
                    </div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.75)",lineHeight:1.6}}>
                      Your <strong style={{color:"#fca5a5"}}>{settings.currentPlan}</strong> plan allows&nbsp;
                      <strong style={{color:"#fca5a5"}}>{planRestrictions.maxUsers}</strong> user{planRestrictions.maxUsers !== 1 ? "s" : ""}.
                      You currently have <strong style={{color:"#fca5a5"}}>{users.length}</strong> users —&nbsp;
                      <strong style={{color:"#fca5a5"}}>{users.length - planRestrictions.maxUsers}</strong> over the limit.
                      Remove the excess user{users.length - planRestrictions.maxUsers !== 1 ? "s" : ""} manually or the system will auto-remove them when the timer reaches zero.
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSection("users")}
                  style={{
                    flexShrink:0, background:"#ef4444", color:"#fff", border:"none",
                    borderRadius:9, padding:"9px 18px", fontSize:13, fontWeight:700,
                    cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap",
                  }}
                >
                  Manage Users
                </button>
              </div>
            )}

            {sectionMap[section]?.()}
          </div>
        </div>

        {/* Create User Modal */}
        {showModal && (
          <div className="ap-modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
            <div className="ap-modal">
              <div className="ap-modal-header">
                <div className="ap-modal-title">{oneTimePass ? "User Created!" : "Create New User"}</div>
                <button className="ap-modal-close" onClick={closeModal}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
              <div className="ap-modal-body">
                {oneTimePass ? (
                  <>
                    <div style={{fontSize:13,color:"#475569",marginBottom:20}}>
                      The user <strong>{form.name || "User"}</strong> has been created. Share the password below — <strong>it will only be shown once.</strong>
                    </div>
                    <div className="ap-otp-box">
                      <div className="ap-otp-label">Auto-Generated Password</div>
                      <div className="ap-otp-warning">⚠ Copy this password now. It cannot be retrieved later.</div>
                      <div className="ap-otp-pass">
                        <span style={{letterSpacing:3}}>{oneTimePass}</span>
                        <button className={`ap-copy-btn ${copied ? "copied" : ""}`} onClick={copyPass}>
                          {copied ? <><CheckIcon /> Copied!</> : <><CopyIcon /> Copy</>}
                        </button>
                      </div>
                    </div>
                    <button className="ap-btn-primary" style={{width:"100%",justifyContent:"center"}} onClick={closeModal}>Done</button>
                  </>
                ) : (
                  <>
                    {formErr && <div className="ap-form-err">{formErr}</div>}
                    <div className="ap-field">
                      <label>Full Name</label>
                      <input className="ap-input" placeholder="e.g. John Smith" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} />
                    </div>
                    <div className="ap-field">
                      <label>Email Address</label>
                      <input className="ap-input" type="email" placeholder="user@company.com" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} />
                    </div>
                    <div className="ap-field">
                      <label>Password</label>
                      <div className="ap-pass-tabs">
                        <button className={`ap-pass-tab ${form.passType === "auto" ? "active" : ""}`} onClick={() => setForm(p => ({...p, passType:"auto"}))}>Auto Generate</button>
                        <button className={`ap-pass-tab ${form.passType === "manual" ? "active" : ""}`} onClick={() => setForm(p => ({...p, passType:"manual"}))}>Set Password</button>
                      </div>
                      {form.passType === "auto" ? (
                        <div className="ap-autogen-info">A <strong>strong random password</strong> will be generated and shown <strong>once</strong> after creation. Make sure to copy it immediately.</div>
                      ) : (
                        <div className="ap-input-wrap">
                          <input className="ap-input" type={form.showPass ? "text" : "password"} placeholder="Enter password" value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))} />
                          <button className="ap-input-eye" type="button" onClick={() => setForm(p => ({...p, showPass: !p.showPass}))}>
                            {form.showPass ? <EyeOffIcon /> : <EyeIcon />}
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Plan-based tool assignment info */}
                    <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:9,padding:"10px 14px",marginBottom:14,fontSize:12,color:"#475569"}}>
                      <div style={{fontWeight:700,color:"#0f172a",marginBottom:5}}>Tools assigned on creation:</div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        {planRestrictions.allowedTools.includes("monitoring") && (
                          <span style={{background:"#eff6ff",color:"#2563eb",border:"1px solid #bfdbfe",borderRadius:6,padding:"2px 10px",fontWeight:700,fontSize:11}}>Monitoring</span>
                        )}
                        {planRestrictions.allowedTools.includes("billing") && (
                          <span style={{background:"#f0fdf4",color:"#16a34a",border:"1px solid #bbf7d0",borderRadius:6,padding:"2px 10px",fontWeight:700,fontSize:11}}>Billing</span>
                        )}
                      </div>
                      {planRestrictions.maxUsers !== Infinity && (
                        <div style={{marginTop:6,color: users.length >= planRestrictions.maxUsers - 1 ? "#dc2626" : "#64748b"}}>
                          {planRestrictions.maxUsers - users.length} slot{planRestrictions.maxUsers - users.length !== 1 ? "s" : ""} remaining on {settings.currentPlan || "your plan"}
                        </div>
                      )}
                    </div>
                    <div style={{display:"flex",gap:10,marginTop:4}}>
                      <button className="ap-btn-primary" style={{flex:1,justifyContent:"center"}} onClick={handleCreate}>Create User</button>
                      <button className="ap-btn-ghost" onClick={closeModal}>Cancel</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
