-- Additive newsletter metadata. No legacy contact becomes subscribed automatically.
ALTER TABLE emails ADD COLUMN purpose TEXT NOT NULL DEFAULT 'transactional' CHECK (purpose IN ('transactional','subscription_confirmation','newsletter'));
ALTER TABLE emails ADD COLUMN newsletter_run_id TEXT;
ALTER TABLE emails ADD COLUMN newsletter_recipient_id TEXT;
ALTER TABLE emails ADD COLUMN newsletter_token_hash TEXT;
ALTER TABLE contacts ADD COLUMN newsletter_address_hmac TEXT;

CREATE TABLE publications (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), name TEXT NOT NULL, slug TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '', timezone TEXT NOT NULL DEFAULT 'UTC', status TEXT NOT NULL CHECK(status IN ('draft','active','archived')),
 site_enabled INTEGER NOT NULL DEFAULT 0 CHECK(site_enabled IN (0,1)), form_enabled INTEGER NOT NULL DEFAULT 0 CHECK(form_enabled IN (0,1)),
 theme_json TEXT NOT NULL, logo_asset_id TEXT, from_address TEXT, from_name TEXT NOT NULL DEFAULT '', reply_to TEXT,
 postal_address TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id,slug), UNIQUE(id,project_id)
);
CREATE INDEX publications_project ON publications(project_id,created_at DESC,id DESC);
CREATE TABLE newsletter_posts (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, publication_id TEXT NOT NULL, slug TEXT NOT NULL,
 title TEXT NOT NULL DEFAULT '', subtitle TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '', subject_overridden INTEGER NOT NULL DEFAULT 0,
 preview_text TEXT NOT NULL DEFAULT '', author_label TEXT NOT NULL DEFAULT '', draft_revision_id TEXT NOT NULL, public_revision_id TEXT,
 web_status TEXT NOT NULL DEFAULT 'draft' CHECK(web_status IN ('draft','scheduled','published','unpublished')),
 web_scheduled_at TEXT, web_scheduled_revision_id TEXT, schedule_timezone TEXT, published_at TEXT, archived_at TEXT,
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(publication_id,slug), UNIQUE(id,publication_id,project_id),
 FOREIGN KEY(publication_id,project_id) REFERENCES publications(id,project_id)
);
CREATE INDEX newsletter_posts_list ON newsletter_posts(publication_id,updated_at DESC,id DESC);
CREATE INDEX newsletter_posts_public ON newsletter_posts(publication_id,web_status,published_at DESC,id DESC);
CREATE TABLE newsletter_post_revisions (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, publication_id TEXT NOT NULL, post_id TEXT NOT NULL, number INTEGER NOT NULL,
 document_schema_version INTEGER NOT NULL DEFAULT 1, document_r2_key TEXT NOT NULL, render_r2_prefix TEXT NOT NULL,
 content_hash TEXT NOT NULL, metadata_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(post_id,number),
 FOREIGN KEY(post_id,publication_id,project_id) REFERENCES newsletter_posts(id,publication_id,project_id) ON DELETE CASCADE
);
CREATE TABLE newsletter_subscriptions (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, publication_id TEXT NOT NULL, contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK(status IN ('pending','subscribed','unsubscribed')), source TEXT NOT NULL,
 consent_text_version TEXT NOT NULL DEFAULT 'v1', consent_source TEXT NOT NULL DEFAULT '', consent_at TEXT, confirmed_at TEXT, unsubscribed_at TEXT,
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(publication_id,contact_id), UNIQUE(id,publication_id,project_id),
 FOREIGN KEY(publication_id,project_id) REFERENCES publications(id,project_id)
);
CREATE INDEX newsletter_subscriptions_list ON newsletter_subscriptions(publication_id,status,created_at DESC,id DESC);
CREATE INDEX newsletter_subscriptions_contact ON newsletter_subscriptions(contact_id,publication_id);
CREATE TABLE newsletter_subscription_events (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, publication_id TEXT NOT NULL, subscription_id TEXT NOT NULL,
 type TEXT NOT NULL, occurred_at TEXT NOT NULL, actor_kind TEXT NOT NULL, data_json TEXT NOT NULL DEFAULT '{}',
 FOREIGN KEY(subscription_id,publication_id,project_id) REFERENCES newsletter_subscriptions(id,publication_id,project_id) ON DELETE CASCADE
);
CREATE INDEX newsletter_events_time ON newsletter_subscription_events(publication_id,occurred_at,id);
CREATE INDEX newsletter_events_subscription ON newsletter_subscription_events(subscription_id,occurred_at,id);
CREATE TABLE newsletter_tags (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, publication_id TEXT NOT NULL, name TEXT NOT NULL,
 UNIQUE(publication_id,name), UNIQUE(id,publication_id,project_id),
 FOREIGN KEY(publication_id,project_id) REFERENCES publications(id,project_id)
);
CREATE TABLE newsletter_subscription_tags (
 project_id TEXT NOT NULL, publication_id TEXT NOT NULL, subscription_id TEXT NOT NULL, tag_id TEXT NOT NULL,
 PRIMARY KEY(subscription_id,tag_id),
 FOREIGN KEY(subscription_id,publication_id,project_id) REFERENCES newsletter_subscriptions(id,publication_id,project_id) ON DELETE CASCADE,
 FOREIGN KEY(tag_id,publication_id,project_id) REFERENCES newsletter_tags(id,publication_id,project_id) ON DELETE CASCADE
);
CREATE INDEX newsletter_tags_members ON newsletter_subscription_tags(tag_id,subscription_id);
CREATE TABLE newsletter_assets (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, publication_id TEXT NOT NULL, r2_key TEXT NOT NULL,
 mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','public','deleted')), created_at TEXT NOT NULL,
 FOREIGN KEY(publication_id,project_id) REFERENCES publications(id,project_id)
);
CREATE TABLE newsletter_tokens (
 token_hash TEXT PRIMARY KEY, project_id TEXT NOT NULL, publication_id TEXT NOT NULL, subscription_id TEXT NOT NULL,
 subscription_revision INTEGER NOT NULL, purpose TEXT NOT NULL CHECK(purpose='confirmation'), expires_at TEXT NOT NULL,
 consumed_at TEXT, created_at TEXT NOT NULL,
 FOREIGN KEY(subscription_id,publication_id,project_id) REFERENCES newsletter_subscriptions(id,publication_id,project_id) ON DELETE CASCADE
);
CREATE TABLE newsletter_revision_assets (
 revision_id TEXT NOT NULL REFERENCES newsletter_post_revisions(id) ON DELETE CASCADE,
 asset_id TEXT NOT NULL REFERENCES newsletter_assets(id), PRIMARY KEY(revision_id,asset_id)
);
CREATE INDEX newsletter_tokens_expiry ON newsletter_tokens(expires_at);
CREATE TABLE newsletter_address_blocks (
 project_id TEXT NOT NULL, publication_id TEXT NOT NULL, address_hmac TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(publication_id,address_hmac), FOREIGN KEY(publication_id,project_id) REFERENCES publications(id,project_id)
);
CREATE TABLE newsletter_import_files (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, publication_id TEXT NOT NULL, r2_key TEXT NOT NULL, content_hash TEXT NOT NULL,
 created_at TEXT NOT NULL, FOREIGN KEY(publication_id,project_id) REFERENCES publications(id,project_id)
);
CREATE TABLE newsletter_imports (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, publication_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','processing','completed','failed','canceled')),
 file_r2_key TEXT NOT NULL, mapping_json TEXT NOT NULL, consent_json TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0,
 total INTEGER NOT NULL, created INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0, skipped INTEGER NOT NULL DEFAULT 0,
 failed INTEGER NOT NULL DEFAULT 0, error_r2_key TEXT, request_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 lease_token TEXT, lease_until TEXT, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(project_id,request_key), FOREIGN KEY(publication_id,project_id) REFERENCES publications(id,project_id)
);
CREATE TABLE newsletter_import_rows (
 import_id TEXT NOT NULL REFERENCES newsletter_imports(id) ON DELETE CASCADE, row_number INTEGER NOT NULL, outcome TEXT NOT NULL,
 contact_id TEXT, error_code TEXT, PRIMARY KEY(import_id,row_number)
);
CREATE TABLE newsletter_jobs (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, publication_id TEXT NOT NULL, kind TEXT NOT NULL,
 entity_id TEXT NOT NULL, generation INTEGER NOT NULL, due_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','leased','completed','failed','canceled')),
 lease_token TEXT, lease_until TEXT, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(kind,entity_id,generation),
 FOREIGN KEY(publication_id,project_id) REFERENCES publications(id,project_id)
);
CREATE INDEX newsletter_jobs_due ON newsletter_jobs(status,due_at,id);
CREATE TABLE newsletter_commands (
 project_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(project_id,idempotency_key)
);
CREATE TABLE newsletter_rate_counters (key TEXT NOT NULL, window TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(key,window));
-- A CHECK failure rolls a whole D1 batch back when a conditional write affected zero rows.
CREATE TABLE newsletter_write_guards (id TEXT PRIMARY KEY, changed INTEGER NOT NULL CHECK(changed=1));

CREATE TABLE newsletter_email_runs (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, publication_id TEXT NOT NULL, post_id TEXT NOT NULL, revision_id TEXT NOT NULL,
 filter_json TEXT NOT NULL, snapshot_at TEXT NOT NULL, status TEXT NOT NULL, scheduled_at TEXT, started_at TEXT, completed_at TEXT,
 provider_policy_version TEXT NOT NULL, request_key TEXT NOT NULL, request_hash TEXT NOT NULL, lease_token TEXT, lease_until TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id,request_key),
 FOREIGN KEY(publication_id,project_id) REFERENCES publications(id,project_id)
);
CREATE INDEX newsletter_runs_due ON newsletter_email_runs(status,scheduled_at,id);
CREATE TABLE newsletter_run_recipients (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, publication_id TEXT NOT NULL, run_id TEXT NOT NULL REFERENCES newsletter_email_runs(id),
 subscription_id TEXT, contact_id TEXT, email_id TEXT UNIQUE, address_snapshot TEXT, personalization_json TEXT NOT NULL,
 status TEXT NOT NULL, skip_reason TEXT, attempts INTEGER NOT NULL DEFAULT 0, lease_token TEXT, lease_until TEXT,
 provider_message_id TEXT, accepted_at TEXT, delivered_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(run_id,subscription_id)
);
CREATE INDEX newsletter_recipients_pending ON newsletter_run_recipients(run_id,status,id);
