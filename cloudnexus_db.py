"""
Shared SQLite database helper for CloudNexus billing backend.
Same DB file as the Node.js monitoring backend.
"""
import sqlite3, json, os, hashlib, hmac
from pathlib import Path
from datetime import datetime, timedelta

DB_PATH  = Path(r"d:\CloudNexus_Website\cloudnexus.db")
_SESSION_KEY = hashlib.sha256(b"cloudnexus-session-key-2024").digest()


def _conn():
    db = sqlite3.connect(str(DB_PATH), timeout=10, check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")   # safe concurrent access
    return db


def init_db():
    with _conn() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          name          TEXT NOT NULL,
          email         TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          totp_secret   TEXT,
          mfa_enabled   INTEGER DEFAULT 0,
          created_at    TEXT DEFAULT (datetime('now')),
          last_login    TEXT
        );
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
        CREATE TABLE IF NOT EXISTS cloud_sessions (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          tool            TEXT NOT NULL,
          provider        TEXT NOT NULL,
          credentials_enc TEXT NOT NULL,
          connected_at    TEXT DEFAULT (datetime('now')),
          expires_at      TEXT NOT NULL,
          UNIQUE(tool, provider)
        );
        """)


# ── Encryption ────────────────────────────────────────────────────────────

def _encrypt(obj: dict) -> str:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    import os, base64
    key   = _SESSION_KEY[:32]
    nonce = os.urandom(12)
    ct    = AESGCM(key).encrypt(nonce, json.dumps(obj).encode(), None)
    return base64.b64encode(nonce + ct).decode()


def _decrypt(enc: str) -> dict:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    import base64
    raw   = base64.b64decode(enc)
    nonce, ct = raw[:12], raw[12:]
    pt    = AESGCM(_SESSION_KEY[:32]).decrypt(nonce, ct, None)
    return json.loads(pt)


# Fallback for Node.js-encrypted sessions (hex format)
def _decrypt_node(enc: str) -> dict:
    """Decrypt sessions written by cloudnexus_db.js (aes-256-gcm, hex)."""
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    iv_hex, tag_hex, data_hex = enc.split(":")
    iv   = bytes.fromhex(iv_hex)
    tag  = bytes.fromhex(tag_hex)
    data = bytes.fromhex(data_hex)
    decryptor = Cipher(
        algorithms.AES(_SESSION_KEY),
        modes.GCM(iv, tag),
    ).decryptor()
    pt = decryptor.update(data) + decryptor.finalize()
    return json.loads(pt)


def _safe_decrypt(enc: str) -> dict | None:
    try:
        # Try Node.js format first (hex with colons)
        if enc.count(":") == 2:
            return _decrypt_node(enc)
        return _decrypt(enc)
    except Exception:
        return None


# ── Cloud Sessions ────────────────────────────────────────────────────────

def save_cloud_session(tool: str, provider: str, creds: dict):
    enc     = _encrypt(creds)
    expires = (datetime.utcnow() + timedelta(hours=48)).strftime("%Y-%m-%d %H:%M:%S")
    with _conn() as db:
        db.execute("""
          INSERT INTO cloud_sessions (tool, provider, credentials_enc, expires_at)
          VALUES (?,?,?,?)
          ON CONFLICT(tool,provider) DO UPDATE SET
            credentials_enc=excluded.credentials_enc,
            connected_at=datetime('now'),
            expires_at=excluded.expires_at
        """, (tool, provider, enc, expires))


def load_cloud_sessions(tool: str) -> list[dict]:
    with _conn() as db:
        rows = db.execute(
            "SELECT * FROM cloud_sessions WHERE tool=? AND expires_at > datetime('now')",
            (tool,)
        ).fetchall()
    result = []
    for r in rows:
        creds = _safe_decrypt(r["credentials_enc"])
        if creds:
            result.append({"provider": r["provider"], "credentials": creds,
                           "expires_at": r["expires_at"]})
    return result


def delete_cloud_session(tool: str, provider: str):
    with _conn() as db:
        db.execute("DELETE FROM cloud_sessions WHERE tool=? AND provider=?", (tool, provider))


# ── Logs ─────────────────────────────────────────────────────────────────

def add_log(user_email: str, action: str, tool: str = None,
            provider: str = None, details=None):
    if isinstance(details, dict):
        details = json.dumps(details)
    with _conn() as db:
        db.execute(
            "INSERT INTO logs (user_email,action,tool,provider,details) VALUES (?,?,?,?,?)",
            (user_email, action, tool, provider, details)
        )


if __name__ == "__main__":
    init_db()
    print("DB initialized at", DB_PATH)
