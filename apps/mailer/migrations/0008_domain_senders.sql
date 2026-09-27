-- Default sender per domain: JSON object { "domain": "Name <address@domain>" }, NULL = none set.
ALTER TABLE projects ADD COLUMN domain_senders TEXT;
