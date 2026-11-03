import { neon } from '@neondatabase/serverless';

let client: ReturnType<typeof neon> | null = null;
export function sql() {
  if (!client) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error('DATABASE_URL is not configured');
    client = neon(url);
  }
  return client;
}

let ready: Promise<void> | null = null;
/** Creates tables on first use (idempotent). */
export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const q = sql();
      await q`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        brand_name TEXT NOT NULL DEFAULT '',
        phone TEXT,
        dob TEXT,
        address JSONB,
        email_verified BOOLEAN NOT NULL DEFAULT FALSE,
        terms_accepted_at TIMESTAMPTZ,
        tier TEXT NOT NULL DEFAULT 'starter',
        sub_status TEXT NOT NULL DEFAULT 'none',
        sub_cycle TEXT,
        period_end TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await q`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ`;
      await q`ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_used BOOLEAN NOT NULL DEFAULT FALSE`;
      await q`CREATE TABLE IF NOT EXISTS payments (
        tx_ref TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tier TEXT NOT NULL,
        cycle TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await q`CREATE TABLE IF NOT EXISTS email_codes (
        email TEXT NOT NULL,
        purpose TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        PRIMARY KEY (email, purpose)
      )`;
      await q`CREATE TABLE IF NOT EXISTS dashboards (
        user_id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await q`CREATE TABLE IF NOT EXISTS buffer_connections (
        user_id TEXT PRIMARY KEY,
        access_token_enc TEXT NOT NULL,
        refresh_token_enc TEXT,
        expires_at TIMESTAMPTZ,
        connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await q`CREATE TABLE IF NOT EXISTS social_connections (
        user_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        access_token_enc TEXT NOT NULL,
        refresh_token_enc TEXT,
        expires_at TIMESTAMPTZ,
        external_id TEXT NOT NULL DEFAULT '',
        handle TEXT NOT NULL DEFAULT '',
        avatar TEXT NOT NULL DEFAULT '',
        followers BIGINT NOT NULL DEFAULT 0,
        extra_enc TEXT,
        connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, platform)
      )`;
      await q`CREATE TABLE IF NOT EXISTS scheduled_posts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        platforms JSONB NOT NULL,
        text TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        video_url TEXT,
        due_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        results JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await q`CREATE TABLE IF NOT EXISTS video_jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        status_url TEXT NOT NULL,
        response_url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        video_url TEXT,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await q`ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS seconds INT NOT NULL DEFAULT 5`;
      await q`ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'plan'`;
      await q`CREATE TABLE IF NOT EXISTS trial_cards (
        card_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await q`CREATE TABLE IF NOT EXISTS postpeer_profiles (
        user_id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL
      )`;
      await q`CREATE TABLE IF NOT EXISTS postpeer_removed (
        user_id TEXT NOT NULL,
        integration_id TEXT NOT NULL,
        PRIMARY KEY (user_id, integration_id)
      )`;
      await q`CREATE TABLE IF NOT EXISTS topups (
        tx_ref TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        seconds INT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await q`CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        count INT NOT NULL,
        reset_at TIMESTAMPTZ NOT NULL
      )`;
      // Series memory: a project groups the episodes (parts) of one story. Mirrors prisma/schema.prisma.
      await q`CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        genre TEXT NOT NULL DEFAULT '',
        character_db JSONB NOT NULL DEFAULT '{"characters":[]}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await q`CREATE INDEX IF NOT EXISTS projects_user_idx ON projects (user_id, updated_at DESC)`;
      await q`CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        part_number INT NOT NULL,
        prompt_input TEXT NOT NULL,
        final_video_url TEXT,
        storyboard_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL DEFAULT 'PROCESSING',
        brief JSONB NOT NULL DEFAULT '{}'::jsonb,
        render_jobs JSONB,
        error TEXT,
        attempts INT NOT NULL DEFAULT 0,
        locked_until TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (project_id, part_number)
      )`;
      await q`CREATE INDEX IF NOT EXISTS episodes_active_idx ON episodes (status) WHERE status IN ('PROCESSING', 'RENDERING')`;
      await q`ALTER TABLE projects ADD COLUMN IF NOT EXISTS target_parts INT NOT NULL DEFAULT 1`;
      await q`ALTER TABLE projects ADD COLUMN IF NOT EXISTS auto_continue BOOLEAN NOT NULL DEFAULT FALSE`;
      await q`CREATE TABLE IF NOT EXISTS webhook_events (
        id TEXT PRIMARY KEY,
        received_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}
