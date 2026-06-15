'use strict';
const path      = require('path');
const fs        = require('fs');
const crypto    = require('crypto');
const bcrypt    = require('bcryptjs');
const initSqlJs = require('sql.js');

const DB_PATH = path.join('d:\\', 'CloudNexus_Website', 'cloudnexus.db');

let _db        = null;
let _saveTimer = null;

function _scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(_persist, 2000);
}
function _persist() {
  if (!_db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(_db.export()));
}

function _rows(result) {
  if (!result.length) return [];
  const cols = result[0].columns;
  return result[0].values.map(r => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
}

async function initDB() {
  const SQL = await initSqlJs();
  _db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  // Base tables
  _db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      email         TEXT    UNIQUE NOT NULL,
      password_hash TEXT    NOT NULL,
      totp_secret   TEXT,
      mfa_enabled   INTEGER DEFAULT 0,
      created_at    TEXT    DEFAULT (datetime('now')),
      last_login    TEXT
    );
  `);
  _db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT,
      action     TEXT NOT NULL,
      provider   TEXT,
      tool       TEXT,
      details    TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_logs_email ON logs(user_email);
    CREATE INDEX IF NOT EXISTS idx_logs_tool  ON logs(tool);
  `);
  _db.run(`
    CREATE TABLE IF NOT EXISTS cloud_sessions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      tool            TEXT NOT NULL,
      provider        TEXT NOT NULL,
      credentials_enc TEXT NOT NULL,
      connected_at    TEXT DEFAULT (datetime('now')),
      expires_at      TEXT NOT NULL,
      UNIQUE(tool, provider)
    );
  `);

  // ── Orgs table — one row per admin, org_name = email domain ───────────────
  _db.run(`
    CREATE TABLE IF NOT EXISTS orgs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      org_name    TEXT    NOT NULL,
      admin_email TEXT    UNIQUE NOT NULL,
      created_at  TEXT    DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_orgs_admin ON orgs(admin_email);
  `);

  // ── Multi-tenant column migrations (safe: silently skip if already exist) ──
  const migrations = [
    "ALTER TABLE users ADD COLUMN role              TEXT DEFAULT 'user'",
    "ALTER TABLE users ADD COLUMN org_admin         TEXT",
    "ALTER TABLE users ADD COLUMN subscription_plan TEXT",
    "ALTER TABLE users ADD COLUMN plan_purchased_at INTEGER",
    "ALTER TABLE users ADD COLUMN plan_paused_at    INTEGER",
    "ALTER TABLE users ADD COLUMN photo             TEXT",
    "ALTER TABLE users ADD COLUMN tools             TEXT DEFAULT '[\"monitoring\",\"billing\"]'",
    "ALTER TABLE logs  ADD COLUMN org_admin         TEXT",
    "ALTER TABLE users ADD COLUMN deleted_at        TEXT",
    "ALTER TABLE users ADD COLUMN deleted_by        TEXT",
  ];
  for (const sql of migrations) { try { _db.run(sql); } catch {} }

  // ── cloud_sessions: add org_admin column (requires table recreation for new UNIQUE) ──
  try {
    const colInfo = _db.exec("PRAGMA table_info(cloud_sessions)");
    const existingCols = _rows(colInfo).map(r => r.name);
    if (!existingCols.includes('org_admin')) {
      _db.run(`CREATE TABLE cloud_sessions_v2 (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        tool            TEXT NOT NULL,
        provider        TEXT NOT NULL,
        org_admin       TEXT NOT NULL DEFAULT '',
        credentials_enc TEXT NOT NULL,
        connected_at    TEXT DEFAULT (datetime('now')),
        expires_at      TEXT NOT NULL,
        UNIQUE(tool, provider, org_admin)
      )`);
      _db.run(`INSERT OR IGNORE INTO cloud_sessions_v2
        (tool, provider, org_admin, credentials_enc, connected_at, expires_at)
        SELECT tool, provider, '', credentials_enc, connected_at, expires_at FROM cloud_sessions`);
      _db.run(`DROP TABLE cloud_sessions`);
      _db.run(`ALTER TABLE cloud_sessions_v2 RENAME TO cloud_sessions`);
      console.log('[DB] Migrated cloud_sessions — added org_admin column');
    }
  } catch (e) { console.log('[DB] cloud_sessions migration:', e.message); }

  // ── Seed migration: promote existing self-registered users to admins ───────
  _runAdminSeedMigration();

  _persist();
  console.log('[DB] SQLite initialized at', DB_PATH);
  return _db;
}

// Runs once on startup: any user with org_admin=NULL becomes an admin,
// gets an org row, and their old logs get org_admin stamped.
function _runAdminSeedMigration() {
  const admins = _rows(_db.exec("SELECT id,name,email FROM users WHERE org_admin IS NULL"));
  for (const u of admins) {
    const domain = u.email.split('@')[1] || u.email;
    // Mark role=admin
    _db.run("UPDATE users SET role='admin' WHERE email=?", [u.email]);
    // Create org row (ignore duplicate)
    try {
      _db.run("INSERT INTO orgs (org_name, admin_email) VALUES (?,?)", [domain, u.email]);
    } catch {}
    // Back-fill org_admin on their own logs
    _db.run("UPDATE logs SET org_admin=? WHERE user_email=? AND org_admin IS NULL", [u.email, u.email]);
  }
}

function getDB() { return _db; }

// ── Users ──────────────────────────────────────────────────────────────────

async function createUser(name, email, password, totpSecret, orgAdmin = null, tools = null, role = 'user') {
  const hash = await bcrypt.hash(password, 10);
  const toolsJson = tools ? JSON.stringify(tools) : '["monitoring","billing"]';
  const userRole  = orgAdmin ? 'user' : role;
  try {
    _db.run(
      `INSERT INTO users (name, email, password_hash, totp_secret, mfa_enabled, org_admin, tools, role)
       VALUES (?,?,?,?,0,?,?,?)`,
      [name, email, hash, totpSecret || null, orgAdmin || null, toolsJson, userRole]
    );
    _persist(); // immediate write — never lose a newly created user on server restart
    return { success: true };
  } catch (e) {
    if (e.message.includes('UNIQUE')) return { error: 'Email already exists' };
    return { error: e.message };
  }
}

async function findUser(email, password) {
  const rows = _db.exec('SELECT * FROM users WHERE email = ?', [email]);
  if (!rows.length || !rows[0].values.length) return null;
  const user = _rows(rows)[0];
  if (!(await bcrypt.compare(password, user.password_hash))) return null;
  return user;
}

function getUserByEmail(email) {
  const rows = _db.exec('SELECT * FROM users WHERE email = ?', [email]);
  if (!rows.length || !rows[0].values.length) return null;
  return _rows(rows)[0];
}

// ── Org queries ────────────────────────────────────────────────────────────

function getAllOrgs() {
  const orgs = _rows(_db.exec('SELECT * FROM orgs ORDER BY created_at ASC'));
  return orgs.map(o => {
    const users = _rows(_db.exec(
      'SELECT id,name,email,tools,photo,created_at,last_login FROM users WHERE org_admin=? AND deleted_at IS NULL',
      [o.admin_email]
    ));
    const logsCount = _db.exec(
      'SELECT COUNT(*) FROM logs WHERE org_admin=?', [o.admin_email]
    );
    return {
      orgName: o.org_name,
      adminEmail: o.admin_email,
      createdAt: o.created_at,
      userCount: users.length,
      logCount: logsCount.length ? (logsCount[0].values[0][0] || 0) : 0,
      users,
    };
  });
}

// Bulk-upsert users from localStorage into the correct admin's org
async function syncOrgUsers(adminEmail, localUsers) {
  const results = { created: 0, skipped: 0 };
  for (const u of localUsers) {
    if (!u.email || !u.name) { results.skipped++; continue; }
    const existing = _rows(_db.exec('SELECT id,org_admin FROM users WHERE email=?', [u.email]));
    if (existing.length) {
      // Already in DB — just make sure org_admin is set if missing
      if (!existing[0].org_admin) {
        _db.run('UPDATE users SET org_admin=? WHERE email=?', [adminEmail, u.email]);
        _db.run('UPDATE logs SET org_admin=? WHERE user_email=? AND org_admin IS NULL', [adminEmail, u.email]);
      }
      results.skipped++;
    } else {
      const pwd = u.password || Math.random().toString(36).slice(-10) + 'X1!';
      const hash = await bcrypt.hash(pwd, 10);
      const tools = u.tools ? JSON.stringify(u.tools) : '["monitoring","billing"]';
      try {
        _db.run(
          `INSERT INTO users (name,email,password_hash,mfa_enabled,org_admin,tools,role,created_at)
           VALUES (?,?,?,0,?,?,'user',datetime(?,'unixepoch'))`,
          [u.name, u.email, hash, adminEmail, tools,
           u.createdAt ? String(Math.floor(u.createdAt / 1000)) : null]
        );
        _db.run('INSERT INTO logs (user_email,action,tool,org_admin) VALUES (?,?,?,?)',
          [u.email, 'sync_from_localstorage', 'website', adminEmail]);
        results.created++;
      } catch { results.skipped++; }
    }
  }
  _scheduleSave();
  return results;
}

// All active (non-deleted) users for a specific admin's org
function getOrgUsers(adminEmail) {
  const rows = _db.exec(
    'SELECT id,name,email,role,mfa_enabled,created_at,last_login,tools,photo FROM users WHERE org_admin=? AND deleted_at IS NULL ORDER BY created_at ASC',
    [adminEmail]
  );
  return _rows(rows);
}

// Soft-deleted users still within the 7-day restore window
function getDeletedOrgUsers(adminEmail) {
  const rows = _db.exec(
    "SELECT id,name,email,role,deleted_at,deleted_by FROM users WHERE LOWER(org_admin)=LOWER(?) AND deleted_at IS NOT NULL AND deleted_at > datetime('now','-7 days') ORDER BY deleted_at DESC",
    [adminEmail]
  );
  return _rows(rows);
}

// Restore a soft-deleted user (clears deleted_at/deleted_by)
function restoreOrgUser(adminEmail, userEmail) {
  _db.run(
    'UPDATE users SET deleted_at=NULL, deleted_by=NULL WHERE LOWER(email)=LOWER(?) AND LOWER(org_admin)=LOWER(?)',
    [userEmail, adminEmail]
  );
  _persist();
}

// Hard-delete users whose 7-day restore window has expired
function purgeExpiredDeletedUsers() {
  _db.run("DELETE FROM users WHERE deleted_at IS NOT NULL AND deleted_at <= datetime('now','-7 days')");
  _persist();
}

// Legacy — all users (no org filter)
function getAllUsers() {
  const rows = _db.exec('SELECT id,name,email,mfa_enabled,created_at,last_login,org_admin FROM users ORDER BY created_at ASC');
  return _rows(rows);
}

// Soft-delete a user — keeps logs for audit, blocks login, 7-day restore window
function deleteOrgUser(adminEmail, userEmail, deletedBy) {
  const now = new Date().toISOString();
  _db.run(
    'UPDATE users SET deleted_at=?, deleted_by=? WHERE LOWER(email)=LOWER(?) AND LOWER(org_admin)=LOWER(?)',
    [now, deletedBy || adminEmail, userEmail, adminEmail]
  );
  _persist();
}

function deleteUser(email) {
  _db.run('DELETE FROM users WHERE email=?', [email]);
  _persist(); // immediate write
}

function updateUserTools(adminEmail, userEmail, tools) {
  _db.run('UPDATE users SET tools=? WHERE email=? AND org_admin=?',
    [JSON.stringify(tools), userEmail, adminEmail]);
  _persist();
}

function markMFAEnabled(email) {
  _db.run("UPDATE users SET mfa_enabled=1, last_login=? WHERE email=?", [new Date().toISOString(), email]);
  _scheduleSave();
}
function updateLastLogin(email) {
  _db.run("UPDATE users SET last_login=? WHERE email=?", [new Date().toISOString(), email]);
  _scheduleSave();
}

// ── Photos ─────────────────────────────────────────────────────────────────

function savePhoto(email, photoBase64) {
  _db.run('UPDATE users SET photo=? WHERE LOWER(email)=LOWER(?)', [photoBase64 || null, email]);
  _persist(); // immediate disk write — never lose a photo on a restart
}

function getPhoto(email) {
  const rows = _db.exec('SELECT photo FROM users WHERE email=?', [email]);
  if (!rows.length || !rows[0].values.length) return null;
  return rows[0].values[0][0] || null;
}

// ── Subscription plan (admin users) ────────────────────────────────────────

function updateAdminPlan(adminEmail, plan, purchasedAt) {
  _db.run(
    'UPDATE users SET subscription_plan=?, plan_purchased_at=?, plan_paused_at=NULL WHERE email=?',
    [plan || null, purchasedAt || null, adminEmail]
  );
  _persist();
}

function cancelAdminPlan(adminEmail) {
  _db.run(
    'UPDATE users SET subscription_plan=NULL, plan_purchased_at=NULL, plan_paused_at=NULL WHERE email=?',
    [adminEmail]
  );
  _persist();
}

function pauseAdminPlan(adminEmail) {
  const now = Date.now();
  _db.run(
    'UPDATE users SET plan_paused_at=? WHERE email=? AND subscription_plan IS NOT NULL AND plan_paused_at IS NULL',
    [now, adminEmail]
  );
  _scheduleSave();
}

function resumeAdminPlan(adminEmail) {
  const rows = _db.exec('SELECT plan_purchased_at, plan_paused_at FROM users WHERE email=?', [adminEmail]);
  if (!rows.length || !rows[0].values.length) return;
  const [purchasedAt, pausedAt] = rows[0].values[0];
  if (!pausedAt) return;
  // Extend purchasedAt by the time spent paused so the admin loses no time
  const pausedDuration = Date.now() - Number(pausedAt);
  const newPurchasedAt = Number(purchasedAt) + pausedDuration;
  _db.run(
    'UPDATE users SET plan_purchased_at=?, plan_paused_at=NULL WHERE email=?',
    [newPurchasedAt, adminEmail]
  );
  _scheduleSave();
}

function getAdminData(adminEmail) {
  const rows = _db.exec(
    'SELECT name,email,subscription_plan,plan_purchased_at,plan_paused_at,photo FROM users WHERE email=?',
    [adminEmail]
  );
  if (!rows.length || !rows[0].values.length) return null;
  return _rows(rows)[0];
}

// ── Logs ───────────────────────────────────────────────────────────────────

function addLog(userEmail, action, tool, provider, details, orgAdmin = null) {
  // Auto-resolve org_admin from user record if not provided
  let org = orgAdmin;
  if (!org && userEmail) {
    try {
      const rows = _db.exec('SELECT org_admin FROM users WHERE email=?', [userEmail]);
      if (rows.length && rows[0].values.length) org = rows[0].values[0][0] || null;
    } catch {}
  }
  _db.run(
    'INSERT INTO logs (user_email,action,tool,provider,details,org_admin) VALUES (?,?,?,?,?,?)',
    [userEmail || null, action, tool || null, provider || null,
     typeof details === 'object' ? JSON.stringify(details) : (details || null),
     org || null]
  );
  _scheduleSave();
}

// Logs scoped to an admin's org (their own actions + their users' actions)
function getOrgLogs(adminEmail, limit = 500) {
  const rows = _db.exec(
    `SELECT * FROM logs WHERE org_admin=? OR user_email=?
     ORDER BY created_at DESC LIMIT ?`,
    [adminEmail, adminEmail, limit]
  );
  return _rows(rows);
}

function getLogs(limit = 200, tool = null) {
  const sql = tool
    ? 'SELECT * FROM logs WHERE tool=? ORDER BY created_at DESC LIMIT ?'
    : 'SELECT * FROM logs ORDER BY created_at DESC LIMIT ?';
  const rows = _db.exec(sql, tool ? [tool, limit] : [limit]);
  return _rows(rows);
}

// ── Cloud Sessions ──────────────────────────────────────────────────────────

const SESSION_KEY = crypto.createHash('sha256').update('cloudnexus-session-key-2024').digest();

function encryptCreds(obj) {
  const iv     = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', SESSION_KEY, iv);
  const enc    = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + cipher.getAuthTag().toString('hex') + ':' + enc.toString('hex');
}
function decryptCreds(enc) {
  const [ivHex, tagHex, dataHex] = enc.split(':');
  const d = crypto.createDecipheriv('aes-256-gcm', SESSION_KEY, Buffer.from(ivHex, 'hex'));
  d.setAuthTag(Buffer.from(tagHex, 'hex'));
  return JSON.parse(d.update(Buffer.from(dataHex, 'hex')) + d.final('utf8'));
}

function saveCloudSession(tool, provider, orgAdmin, creds) {
  const enc     = encryptCreds(creds);
  const expires = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const org     = (orgAdmin || '').toLowerCase().trim();
  _db.run(
    `INSERT INTO cloud_sessions (tool,provider,org_admin,credentials_enc,expires_at) VALUES (?,?,?,?,?)
     ON CONFLICT(tool,provider,org_admin) DO UPDATE SET
       credentials_enc=excluded.credentials_enc,
       connected_at=datetime('now'),
       expires_at=excluded.expires_at`,
    [tool, provider, org, enc, expires]
  );
  _scheduleSave();
}

function loadCloudSessions(tool, orgAdmin) {
  const org  = (orgAdmin || '').toLowerCase().trim();
  const rows = _db.exec(
    "SELECT * FROM cloud_sessions WHERE tool=? AND org_admin=? AND expires_at > datetime('now')",
    [tool, org]
  );
  return _rows(rows).map(row => {
    try { row.credentials = decryptCreds(row.credentials_enc); } catch { row.credentials = null; }
    return row;
  });
}

function loadAllCloudSessions(tool) {
  const rows = _db.exec(
    "SELECT * FROM cloud_sessions WHERE tool=? AND expires_at > datetime('now')",
    [tool]
  );
  return _rows(rows).map(row => {
    try { row.credentials = decryptCreds(row.credentials_enc); } catch { row.credentials = null; }
    return row;
  });
}

function deleteCloudSession(tool, provider, orgAdmin) {
  const org = (orgAdmin || '').toLowerCase().trim();
  _db.run('DELETE FROM cloud_sessions WHERE tool=? AND provider=? AND org_admin=?', [tool, provider, org]);
  _scheduleSave();
}

function getOrgAdminForUser(userEmail) {
  if (!userEmail) return null;
  const rows = _db.exec('SELECT org_admin FROM users WHERE LOWER(email)=LOWER(?)', [userEmail]);
  const user = _rows(rows)[0];
  if (!user) return null;
  return ((user.org_admin || userEmail).toLowerCase().trim()) || null;
}

module.exports = {
  initDB, getDB,
  createUser, findUser, getUserByEmail, getAllUsers,
  getOrgUsers, deleteOrgUser, deleteUser, updateUserTools,
  getDeletedOrgUsers, restoreOrgUser, purgeExpiredDeletedUsers,
  syncOrgUsers, getAllOrgs,
  markMFAEnabled, updateLastLogin,
  savePhoto, getPhoto,
  updateAdminPlan, cancelAdminPlan, pauseAdminPlan, resumeAdminPlan, getAdminData,
  addLog, getLogs, getOrgLogs,
  saveCloudSession, loadCloudSessions, loadAllCloudSessions, deleteCloudSession,
  getOrgAdminForUser,
};
