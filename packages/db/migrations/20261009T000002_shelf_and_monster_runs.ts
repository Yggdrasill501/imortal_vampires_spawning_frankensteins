import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE monster_run (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      process_id uuid NOT NULL REFERENCES process (id),
      kind text NOT NULL CHECK (kind IN ('learn', 'repair')),
      status text NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'verified', 'failed')),
      model text NOT NULL,
      tokens_input bigint NOT NULL DEFAULT 0,
      tokens_output bigint NOT NULL DEFAULT 0,
      tokens_cached bigint NOT NULL DEFAULT 0,
      reason text,
      failed_run_id uuid,
      learned_on_item_id text,
      what_changed text,
      created_at timestamptz NOT NULL DEFAULT now(),
      started_at timestamptz,
      ended_at timestamptz
    )
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX monster_run_one_live_idx
    ON monster_run (process_id)
    WHERE status IN ('queued', 'running')
  `.execute(db);
  await sql`CREATE INDEX monster_run_status_created_at_idx ON monster_run (status, created_at)`.execute(
    db,
  );

  await sql`
    CREATE TABLE tool (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL UNIQUE CHECK (name ~ '^[a-z][a-z0-9_]{0,63}$'),
      description text NOT NULL,
      kind text NOT NULL CHECK (kind IN ('reads', 'writes')),
      created_by_monster_run_id uuid NOT NULL REFERENCES monster_run (id),
      created_for_process_id uuid NOT NULL REFERENCES process (id),
      current_version_id uuid,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE tool_site (
      tool_id uuid NOT NULL REFERENCES tool (id),
      site text NOT NULL,
      PRIMARY KEY (tool_id, site)
    )
  `.execute(db);
  await sql`CREATE INDEX tool_site_site_idx ON tool_site (site)`.execute(db);

  await sql`
    CREATE TABLE tool_version (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tool_id uuid NOT NULL REFERENCES tool (id),
      version integer NOT NULL CHECK (version >= 1),
      code_path text NOT NULL UNIQUE,
      origin_kind text NOT NULL CHECK (origin_kind IN ('learn', 'repair')),
      monster_run_id uuid NOT NULL REFERENCES monster_run (id),
      examples jsonb NOT NULL DEFAULT '[]'::jsonb,
      became_current_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tool_id, version)
    )
  `.execute(db);
  await sql`
    ALTER TABLE tool
    ADD CONSTRAINT tool_current_version_id_fkey
    FOREIGN KEY (current_version_id) REFERENCES tool_version (id)
    DEFERRABLE INITIALLY DEFERRED
  `.execute(db);

  await sql`
    CREATE TABLE process_step (
      process_id uuid NOT NULL REFERENCES process (id),
      position integer NOT NULL CHECK (position >= 1),
      tool_id uuid NOT NULL REFERENCES tool (id),
      origin text NOT NULL CHECK (origin IN ('made', 'reused')),
      PRIMARY KEY (process_id, position)
    )
  `.execute(db);
  await sql`CREATE INDEX process_step_tool_id_idx ON process_step (tool_id)`.execute(db);

  await sql`
    CREATE TABLE monster_run_tool (
      monster_run_id uuid NOT NULL REFERENCES monster_run (id),
      tool_id uuid NOT NULL REFERENCES tool (id),
      origin text NOT NULL CHECK (origin IN ('made', 'reused')),
      PRIMARY KEY (monster_run_id, tool_id)
    )
  `.execute(db);

  await sql`
    CREATE TABLE monster_action (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      monster_run_id uuid NOT NULL REFERENCES monster_run (id),
      seq bigint GENERATED ALWAYS AS IDENTITY,
      at timestamptz NOT NULL DEFAULT now(),
      kind text NOT NULL CHECK (kind IN (
        'search_shelf', 'open_page', 'click', 'type', 'read',
        'reuse_tool', 'create_tool', 'test_tool', 'save_process', 'refused'
      )),
      text text NOT NULL,
      tool_name text
    )
  `.execute(db);
  await sql`CREATE INDEX monster_action_run_seq_idx ON monster_action (monster_run_id, seq)`.execute(
    db,
  );

  await sql`
    CREATE TABLE verification_line (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      monster_run_id uuid NOT NULL REFERENCES monster_run (id),
      seq bigint GENERATED ALWAYS AS IDENTITY,
      at timestamptz NOT NULL DEFAULT now(),
      text text NOT NULL,
      outcome text NOT NULL DEFAULT 'pending'
        CHECK (outcome IN ('pending', 'passed', 'failed'))
    )
  `.execute(db);
  await sql`CREATE INDEX verification_line_run_seq_idx ON verification_line (monster_run_id, seq)`.execute(
    db,
  );

  await sql`
    ALTER TABLE process
    ADD COLUMN current_monster_run_id uuid
    REFERENCES monster_run (id)
    DEFERRABLE INITIALLY DEFERRED
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE process DROP COLUMN IF EXISTS current_monster_run_id`.execute(db);
  await sql`DROP TABLE IF EXISTS verification_line`.execute(db);
  await sql`DROP TABLE IF EXISTS monster_action`.execute(db);
  await sql`DROP TABLE IF EXISTS monster_run_tool`.execute(db);
  await sql`DROP TABLE IF EXISTS process_step`.execute(db);
  await sql`ALTER TABLE tool DROP CONSTRAINT IF EXISTS tool_current_version_id_fkey`.execute(db);
  await sql`DROP TABLE IF EXISTS tool_version`.execute(db);
  await sql`DROP TABLE IF EXISTS tool_site`.execute(db);
  await sql`DROP TABLE IF EXISTS tool`.execute(db);
  await sql`DROP TABLE IF EXISTS monster_run`.execute(db);
}
