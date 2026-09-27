-- Phase 2: webhooks, search index, key expiry, domain status cache.
CREATE TABLE webhooks (
  id          TEXT PRIMARY KEY,               -- wh_...
  project_id  TEXT NOT NULL REFERENCES projects(id),
  url         TEXT NOT NULL,
  secret      TEXT NOT NULL,                  -- "whsec_" + 32 base62; shown once on create
  events      TEXT NOT NULL,                  -- JSON array of event types, or ["*"]
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX webhooks_project ON webhooks(project_id);

-- event_id has no foreign key, and the exact JSON body is stored in `payload`
-- at enqueue time. This lets POST /v1/webhooks/:id/test deliver a synthetic event that has no email_events row.
CREATE TABLE webhook_deliveries (
  id              TEXT PRIMARY KEY,           -- whd_...
  webhook_id      TEXT NOT NULL REFERENCES webhooks(id),
  event_id        TEXT NOT NULL,              -- email_events.id, or evt_test_... for test deliveries
  event_type      TEXT,
  payload         TEXT NOT NULL,              -- JSON body POSTed to the endpoint
  attempt         INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL,              -- pending|success|failed
  response_code   INTEGER,
  response_body   TEXT,                       -- first 1 KB
  next_attempt_at TEXT,
  created_at      TEXT NOT NULL,
  completed_at    TEXT
);
CREATE INDEX whd_webhook ON webhook_deliveries(webhook_id, created_at DESC);

-- search + key management additions
CREATE INDEX emails_project_subject ON emails(project_id, subject);
ALTER TABLE api_keys ADD COLUMN expires_at TEXT;

-- domain verification cache (6.6)
CREATE TABLE domain_status (
  domain      TEXT PRIMARY KEY,
  status      TEXT NOT NULL,                  -- onboarded|pending|missing|unknown
  details     TEXT,                           -- JSON from Cloudflare
  checked_at  TEXT NOT NULL
);
