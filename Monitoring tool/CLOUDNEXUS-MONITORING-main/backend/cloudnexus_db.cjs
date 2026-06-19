'use strict';
const path      = require('path');
const fs        = require('fs');
const crypto    = require('crypto');
const bcrypt    = require('bcryptjs');
const initSqlJs = require('sql.js');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'cloudnexus.db');

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

  // ── Cloud Accounts (multi-account-per-provider credential model) ──────────
  _db.run(`
    CREATE TABLE IF NOT EXISTS cloud_accounts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      org_admin       TEXT    NOT NULL,
      provider        TEXT    NOT NULL CHECK(provider IN ('aws','gcp','azure')),
      label           TEXT    NOT NULL,
      credentials_enc TEXT    NOT NULL,
      account_meta    TEXT,
      status          TEXT    NOT NULL DEFAULT 'active',
      created_at      TEXT    DEFAULT (datetime('now')),
      created_by      TEXT    NOT NULL,
      updated_at      TEXT    DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cloud_accounts_org ON cloud_accounts(org_admin);

    CREATE TABLE IF NOT EXISTS cloud_account_access (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id  INTEGER NOT NULL,
      user_email  TEXT    NOT NULL,
      granted_at  TEXT    DEFAULT (datetime('now')),
      granted_by  TEXT,
      UNIQUE(account_id, user_email)
    );
    CREATE INDEX IF NOT EXISTS idx_cloud_account_access_user ON cloud_account_access(user_email);
  `);

  // ── Active account per user per provider ──────────────────────────────────
  _db.run(`
    CREATE TABLE IF NOT EXISTS user_primary_accounts (
      user_email TEXT NOT NULL,
      provider   TEXT NOT NULL,
      account_id INTEGER NOT NULL,
      set_at     TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_email, provider)
    );
  `);

  // ── Account activation tokens ─────────────────────────────────────────────
  _db.run(`
    CREATE TABLE IF NOT EXISTS activation_tokens (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      email      TEXT    NOT NULL,
      token      TEXT    UNIQUE NOT NULL,
      expires_at TEXT    NOT NULL,
      used_at    TEXT,
      created_at TEXT    DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_activation_token ON activation_tokens(token);
  `);

  // ── Seed migration: promote existing self-registered users to admins ───────
  _runAdminSeedMigration();

  // ── One-time migration: legacy single-account cloud_sessions → cloud_accounts ──
  _migrateCloudSessionsToAccounts();

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

// Runs once: migrates legacy single-account-per-provider cloud_sessions rows
// into the new multi-account cloud_accounts model, granting every existing
// org user access so nobody loses a currently-working connection.
function _migrateCloudSessionsToAccounts() {
  const already = _rows(_db.exec('SELECT COUNT(*) as c FROM cloud_accounts'));
  if (already.length && already[0].c > 0) return;
  const sessions = _rows(_db.exec('SELECT * FROM cloud_sessions'));
  if (!sessions.length) return;
  for (const s of sessions) {
    if (!s.org_admin) continue;
    const label = `${String(s.provider).toUpperCase()} Account (migrated)`;
    _db.run(
      `INSERT INTO cloud_accounts (org_admin, provider, label, credentials_enc, status, created_by)
       VALUES (?,?,?,?, 'active', ?)`,
      [s.org_admin, s.provider, label, s.credentials_enc, s.org_admin]
    );
    const accountId = _db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    const orgUsers = getOrgUsers(s.org_admin);
    const emails = new Set([s.org_admin, ...orgUsers.map(u => u.email)]);
    for (const email of emails) {
      try {
        _db.run(
          'INSERT OR IGNORE INTO cloud_account_access (account_id, user_email, granted_by) VALUES (?,?,?)',
          [accountId, (email || '').toLowerCase().trim(), s.org_admin]
        );
      } catch {}
    }
  }
  console.log(`[DB] Migrated ${sessions.length} cloud_sessions row(s) into cloud_accounts`);
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
function saveUserTOTPSecret(email, secret) {
  _db.run("UPDATE users SET totp_secret=? WHERE LOWER(email)=LOWER(?)", [secret || null, email]);
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

const SESSION_KEY = process.env.ENCRYPTION_KEY
  ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  : crypto.createHash('sha256').update('cloudnexus-session-key-2024').digest();

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

// ── Cloud Accounts (multi-account-per-provider, per-user ACL) ───────────────

function createCloudAccount(orgAdmin, provider, label, creds, meta, createdBy) {
  const org = (orgAdmin || '').toLowerCase().trim();
  const enc = encryptCreds(creds);
  _db.run(
    `INSERT INTO cloud_accounts (org_admin, provider, label, credentials_enc, account_meta, created_by)
     VALUES (?,?,?,?,?,?)`,
    [org, provider, label, enc, meta ? JSON.stringify(meta) : null, createdBy]
  );
  const id = _db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  _persist();
  return id;
}

function _accountRow(row) {
  let meta = null;
  try { meta = row.account_meta ? JSON.parse(row.account_meta) : null; } catch {}
  return {
    id: row.id,
    orgAdmin: row.org_admin,
    provider: row.provider,
    label: row.label,
    accountMeta: meta,
    status: row.status,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  };
}

function listCloudAccounts(orgAdmin) {
  const org = (orgAdmin || '').toLowerCase().trim();
  const rows = _rows(_db.exec('SELECT * FROM cloud_accounts WHERE org_admin=? ORDER BY created_at ASC', [org]));
  return rows.map(row => {
    const account = _accountRow(row);
    const assigned = _rows(_db.exec(
      `SELECT u.name as name, a.user_email as email FROM cloud_account_access a
       LEFT JOIN users u ON LOWER(u.email)=LOWER(a.user_email)
       WHERE a.account_id=?`,
      [row.id]
    ));
    account.assignedUsers = assigned.map(u => ({ email: u.email, name: u.name || u.email }));
    return account;
  });
}

function getCloudAccount(accountId) {
  const rows = _rows(_db.exec('SELECT * FROM cloud_accounts WHERE id=?', [accountId]));
  if (!rows.length) return null;
  const account = _accountRow(rows[0]);
  try { account.credentials = decryptCreds(rows[0].credentials_enc); } catch { account.credentials = null; }
  return account;
}

function updateCloudAccount(accountId, { label, creds, meta, status } = {}) {
  const sets = [];
  const params = [];
  if (label !== undefined)  { sets.push('label=?');  params.push(label); }
  if (creds !== undefined)  { sets.push('credentials_enc=?'); params.push(encryptCreds(creds)); }
  if (meta !== undefined)   { sets.push('account_meta=?'); params.push(meta ? JSON.stringify(meta) : null); }
  if (status !== undefined) { sets.push('status=?'); params.push(status); }
  if (!sets.length) return;
  sets.push("updated_at=datetime('now')");
  params.push(accountId);
  _db.run(`UPDATE cloud_accounts SET ${sets.join(', ')} WHERE id=?`, params);
  _persist();
}

function deleteCloudAccount(accountId) {
  _db.run('DELETE FROM cloud_account_access WHERE account_id=?', [accountId]);
  _db.run('DELETE FROM cloud_accounts WHERE id=?', [accountId]);
  _persist();
}

function grantAccountAccess(accountId, userEmail, grantedBy) {
  const email = (userEmail || '').toLowerCase().trim();
  if (!email) return;
  _db.run(
    'INSERT OR IGNORE INTO cloud_account_access (account_id, user_email, granted_by) VALUES (?,?,?)',
    [accountId, email, grantedBy || null]
  );
  _persist();
}

function revokeAccountAccess(accountId, userEmail) {
  const email = (userEmail || '').toLowerCase().trim();
  _db.run('DELETE FROM cloud_account_access WHERE account_id=? AND LOWER(user_email)=?', [accountId, email]);
  _persist();
}

function listAccountAssignments(accountId) {
  const rows = _rows(_db.exec('SELECT user_email FROM cloud_account_access WHERE account_id=?', [accountId]));
  return rows.map(r => r.user_email);
}

function listAccountsForUser(userEmail) {
  const email = (userEmail || '').toLowerCase().trim();
  const rows = _rows(_db.exec(
    `SELECT ca.* FROM cloud_accounts ca
     JOIN cloud_account_access a ON a.account_id=ca.id
     WHERE LOWER(a.user_email)=? AND ca.status='active'
     ORDER BY ca.created_at ASC`,
    [email]
  ));
  return rows.map(_accountRow);
}

function isUserAssignedToAccount(userEmail, accountId) {
  const email = (userEmail || '').toLowerCase().trim();
  const rows = _rows(_db.exec(
    'SELECT 1 as x FROM cloud_account_access WHERE account_id=? AND LOWER(user_email)=?',
    [accountId, email]
  ));
  return rows.length > 0;
}

function listAllActiveCloudAccounts() {
  const rows = _rows(_db.exec("SELECT * FROM cloud_accounts WHERE status='active'"));
  return rows.map(_accountRow);
}

// ── Primary (active) account per user per provider ────────────────────────

function setUserPrimaryAccount(userEmail, provider, accountId) {
  const email = (userEmail || '').toLowerCase().trim();
  _db.run(
    `INSERT INTO user_primary_accounts (user_email, provider, account_id, set_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_email, provider) DO UPDATE SET account_id=excluded.account_id, set_at=excluded.set_at`,
    [email, provider, accountId]
  );
  _persist();
}

function getUserPrimaryAccountId(userEmail, provider) {
  const email = (userEmail || '').toLowerCase().trim();
  const rows = _rows(_db.exec(
    'SELECT account_id FROM user_primary_accounts WHERE LOWER(user_email)=? AND provider=?',
    [email, provider]
  ));
  return rows[0]?.account_id ?? null;
}

// Returns one active account per provider for a user.
// Respects the user's primary selection; auto-picks the first assigned if not set.
function getActiveAccountsForUser(userEmail) {
  const email = (userEmail || '').toLowerCase().trim();
  const all = _rows(_db.exec(
    `SELECT ca.* FROM cloud_accounts ca
     JOIN cloud_account_access a ON a.account_id=ca.id
     WHERE LOWER(a.user_email)=? AND ca.status='active'
     ORDER BY ca.created_at ASC`,
    [email]
  )).map(_accountRow);

  const byProvider = {};
  for (const acc of all) {
    if (!byProvider[acc.provider]) byProvider[acc.provider] = acc;
  }
  for (const provider of Object.keys(byProvider)) {
    const primaryId = getUserPrimaryAccountId(email, provider);
    if (primaryId) {
      const primary = all.find(a => a.id === primaryId);
      if (primary) byProvider[provider] = primary;
    }
  }
  return Object.values(byProvider);
}

// Batched per-org lookup for the Users-tab logo badges: for every user in
// the org, which accounts (id/provider/label) are they assigned to.
function listOrgUserAccountAccess(orgAdmin) {
  const org = (orgAdmin || '').toLowerCase().trim();
  const rows = _rows(_db.exec(
    `SELECT a.user_email as email, ca.id as id, ca.provider as provider, ca.label as label
     FROM cloud_account_access a
     JOIN cloud_accounts ca ON ca.id=a.account_id
     WHERE ca.org_admin=?`,
    [org]
  ));
  const byUser = {};
  for (const r of rows) {
    const email = (r.email || '').toLowerCase().trim();
    if (!byUser[email]) byUser[email] = [];
    byUser[email].push({ id: r.id, provider: r.provider, label: r.label });
  }
  return byUser;
}

// ── Activation Tokens ─────────────────────────────────────────────────────

function createActivationToken(email) {
  const e     = (email || '').toLowerCase().trim();
  const token = crypto.randomBytes(32).toString('hex');
  const exp   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
  _db.run('DELETE FROM activation_tokens WHERE LOWER(email)=?', [e]);
  _db.run('INSERT INTO activation_tokens (email, token, expires_at) VALUES (?,?,?)', [e, token, exp]);
  _scheduleSave();
  return token;
}

function getActivationToken(token) {
  const rows = _rows(_db.exec(
    "SELECT * FROM activation_tokens WHERE token=? AND used_at IS NULL AND expires_at > datetime('now')",
    [token]
  ));
  return rows[0] || null;
}

function consumeActivationToken(token) {
  _db.run("UPDATE activation_tokens SET used_at=datetime('now') WHERE token=?", [token]);
  _scheduleSave();
}

async function activateUser(email, plainPassword, totpSecret) {
  const e    = (email || '').toLowerCase().trim();
  const hash = await bcrypt.hash(plainPassword, 12);
  _db.run(
    'UPDATE users SET password_hash=?, totp_secret=?, mfa_enabled=1 WHERE LOWER(email)=?',
    [hash, totpSecret, e]
  );
  _scheduleSave();
}

module.exports = {
  initDB, getDB,
  createUser, findUser, getUserByEmail, getAllUsers,
  getOrgUsers, deleteOrgUser, deleteUser, updateUserTools,
  getDeletedOrgUsers, restoreOrgUser, purgeExpiredDeletedUsers,
  syncOrgUsers, getAllOrgs,
  markMFAEnabled, saveUserTOTPSecret, updateLastLogin,
  savePhoto, getPhoto,
  updateAdminPlan, cancelAdminPlan, pauseAdminPlan, resumeAdminPlan, getAdminData,
  addLog, getLogs, getOrgLogs,
  saveCloudSession, loadCloudSessions, loadAllCloudSessions, deleteCloudSession,
  getOrgAdminForUser,
  createCloudAccount, listCloudAccounts, getCloudAccount, updateCloudAccount, deleteCloudAccount,
  grantAccountAccess, revokeAccountAccess, listAccountAssignments,
  listAccountsForUser, isUserAssignedToAccount, listAllActiveCloudAccounts,
  setUserPrimaryAccount, getUserPrimaryAccountId, getActiveAccountsForUser,
  listOrgUserAccountAccess,
  createActivationToken, getActivationToken, consumeActivationToken, activateUser,
};
