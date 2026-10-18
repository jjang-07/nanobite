PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;

CREATE TABLE IF NOT EXISTS context_prs (
  id TEXT PRIMARY KEY,                       -- cpr_<base36 time><4 random>
  state TEXT NOT NULL,                       -- queued|requested|received|drafting|awaiting_approval|approved|denied|delivered|reported|failed
  requester_identity TEXT NOT NULL,          -- yunha-agent@<startup>.primitive.email
  responder_identity TEXT NOT NULL,          -- sdk-help@<acme>.primitive.email
  on_behalf_of TEXT,                         -- human label, e.g. "Yunha (startup)"
  topic TEXT NOT NULL,                       -- kebab tag, e.g. acme-sdk/retries
  question TEXT NOT NULL,
  context_hint TEXT,                         -- failing test name + output excerpt
  request_sent_email_id TEXT,                -- Primitive sent id (requester side)
  request_inbound_email_id TEXT,             -- Primitive inbound id (responder side)
  request_thread_id TEXT,
  matched_source_ids TEXT,                   -- JSON string[]
  draft_answer TEXT,                         -- gate 2 output after gate 1 (what TK sees)
  draft_flagged TEXT,                        -- JSON string[] phrases the model flagged for TK
  removals TEXT,                             -- JSON Removal[] {placeholder,count}
  approval_sent_email_id TEXT,               -- email to TK
  approval_thread_id TEXT,
  decision TEXT,                             -- approve|approve_always|deny|edit|auto
  decision_reason TEXT,
  approved_text TEXT,                        -- the capsule, byte for byte
  approver TEXT,                             -- TK's address
  decided_at TEXT,
  capsule_sent_email_id TEXT,                -- reply to the request (responder side)
  capsule_inbound_email_id TEXT,             -- as received on the requester side
  outcome_result TEXT,                       -- passed|failed|partial|not_applied
  outcome_note TEXT,
  tokens_source INTEGER,
  tokens_capsule INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,                       -- <session_id>:<turn_index>
  owner_identity TEXT NOT NULL,
  session_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  turn_index INTEGER NOT NULL,
  role TEXT NOT NULL,                        -- user|assistant|tool|assistant_tool
  text TEXT NOT NULL,
  timestamp TEXT
);
CREATE INDEX IF NOT EXISTS sources_owner ON sources(owner_identity, session_id, turn_index);

CREATE TABLE IF NOT EXISTS denylist (
  id INTEGER PRIMARY KEY,
  responder_identity TEXT NOT NULL,
  kind TEXT NOT NULL,                        -- literal|regex|sentence
  pattern TEXT NOT NULL,
  placeholder TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS rules (                -- auto-merge rules created by "approve always"
  id TEXT PRIMARY KEY,
  responder_identity TEXT NOT NULL,
  requester_identity TEXT NOT NULL,
  topic TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_from_pr TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE(responder_identity, requester_identity, topic)
);

CREATE TABLE IF NOT EXISTS sent_emails (          -- correlate Primitive sent ids to PRs
  sent_email_id TEXT PRIMARY KEY,
  pr_id TEXT NOT NULL,
  purpose TEXT NOT NULL,                     -- request|approval|clarification|capsule|denial|notification|ack
  identity TEXT NOT NULL,
  handled INTEGER NOT NULL DEFAULT 0,        -- 1 once a reply (or none expected) has been processed
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inbound_seen (         -- dedup inbound emails across polls and restarts
  email_id TEXT PRIMARY KEY,
  identity TEXT NOT NULL,
  seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cursors (
  identity TEXT PRIMARY KEY,
  since TEXT                                 -- Primitive forward-tail cursor "<ISO>|<id>"
);

CREATE TABLE IF NOT EXISTS events (               -- audit timeline for the dashboard
  id INTEGER PRIMARY KEY,
  pr_id TEXT NOT NULL,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,                        -- created|request_sent|received|sources_matched|rules_applied|drafted|approval_sent|decision|auto_merged|capsule_sent|delivered|denied|outcome|error
  detail TEXT                                -- JSON
);
CREATE INDEX IF NOT EXISTS events_pr ON events(pr_id, id);
