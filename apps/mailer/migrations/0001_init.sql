-- Phase 1: projects, API keys, emails.
CREATE TABLE projects (
  id              TEXT PRIMARY KEY,            -- proj_...
  slug            TEXT NOT NULL UNIQUE,        -- "acme"
  name            TEXT NOT NULL,
  default_from    TEXT,                        -- "Acme <hello@acme.com>"
  allowed_domains TEXT NOT NULL,               -- JSON array of domains, lowercase
  allowed_senders TEXT,                        -- JSON array of full addresses, lowercase, or NULL = any address on allowed_domains
  rpc_enabled     INTEGER NOT NULL DEFAULT 1,  -- may this project be used over the service binding
  daily_limit     INTEGER NOT NULL DEFAULT 5000,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  disabled_at     TEXT
);

CREATE TABLE api_keys (
  id           TEXT PRIMARY KEY,               -- key_...
  project_id   TEXT NOT NULL REFERENCES projects(id),
  name         TEXT NOT NULL,
  mode         TEXT NOT NULL CHECK (mode IN ('live','test')),
  key_prefix   TEXT NOT NULL,                  -- "fs_live_a1b2"
  key_hash     TEXT NOT NULL UNIQUE,           -- sha256 hex of the full key
  last_used_at TEXT,
  created_at   TEXT NOT NULL,
  revoked_at   TEXT
);
CREATE INDEX api_keys_prefix ON api_keys(key_prefix);

CREATE TABLE emails (
  id                    TEXT PRIMARY KEY,      -- email_...
  project_id            TEXT NOT NULL REFERENCES projects(id),
  api_key_id            TEXT REFERENCES api_keys(id),  -- NULL when sent over RPC
  mode                  TEXT NOT NULL CHECK (mode IN ('live','test')),
  source                TEXT NOT NULL CHECK (source IN ('http','rpc','batch','broadcast','scheduled')),

  from_address          TEXT NOT NULL,         -- bare address, lowercase
  from_name             TEXT,
  reply_to              TEXT,
  to_addresses          TEXT NOT NULL,         -- JSON array
  cc_addresses          TEXT NOT NULL DEFAULT '[]',
  bcc_addresses         TEXT NOT NULL DEFAULT '[]',
  subject               TEXT NOT NULL,
  text_preview          TEXT,                  -- first 200 chars of text (or stripped html)
  has_html              INTEGER NOT NULL DEFAULT 0,
  has_text              INTEGER NOT NULL DEFAULT 0,
  attachment_count      INTEGER NOT NULL DEFAULT 0,
  size_bytes            INTEGER NOT NULL,      -- JSON payload size in R2
  tags                  TEXT,                  -- JSON object of string->string
  template_name         TEXT,                  -- phase 2
  idempotency_key       TEXT,
  body_hash             TEXT,                  -- sha256 of canonical JSON of the parsed input

  status                TEXT NOT NULL,
  cloudflare_message_id TEXT,
  last_error_code       TEXT,
  last_error_message    TEXT,
  attempts              INTEGER NOT NULL DEFAULT 0,

  created_at            TEXT NOT NULL,
  queued_at             TEXT,
  sent_at               TEXT,
  delivered_at          TEXT,                  -- when ALL recipients delivered
  failed_at             TEXT,                  -- first terminal failure
  scheduled_at          TEXT                   -- phase 3
);
CREATE UNIQUE INDEX emails_idempotency ON emails(project_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX emails_project_created ON emails(project_id, created_at DESC);
CREATE INDEX emails_project_status ON emails(project_id, status, created_at DESC);
CREATE INDEX emails_cf_message ON emails(cloudflare_message_id);
