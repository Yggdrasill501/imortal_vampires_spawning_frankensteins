import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE tick (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      process_id uuid NOT NULL REFERENCES process (id),
      kind text NOT NULL CHECK (kind IN ('scheduled', 'run_now')),
      status text NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'finished')),
      new_items integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      started_at timestamptz,
      finished_at timestamptz
    )
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX tick_one_live_idx
    ON tick (process_id)
    WHERE status IN ('queued', 'running')
  `.execute(db);
  await sql`CREATE INDEX tick_status_created_at_idx ON tick (status, created_at)`.execute(db);
  await sql`CREATE INDEX tick_process_finished_at_idx ON tick (process_id, finished_at)`.execute(
    db,
  );

  await sql`
    CREATE TABLE run (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      process_id uuid NOT NULL REFERENCES process (id),
      tick_id uuid REFERENCES tick (id),
      monster_run_id uuid REFERENCES monster_run (id),
      kind text NOT NULL CHECK (kind IN ('verification', 'scheduled', 'run_now', 'after_repair')),
      item_id text NOT NULL,
      item_label text NOT NULL,
      item_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
      status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'passed', 'failed', 'refused')),
      created_at timestamptz NOT NULL DEFAULT now(),
      started_at timestamptz,
      finished_at timestamptz,
      duration_ms integer,
      model_calls integer NOT NULL DEFAULT 0,
      proof_value text,
      failed_step integer,
      error text,
      repair_id uuid
    )
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX run_one_live_idx
    ON run (process_id, item_id)
    WHERE status IN ('pending', 'running')
  `.execute(db);
  await sql`CREATE INDEX run_process_created_at_idx ON run (process_id, created_at)`.execute(db);
  await sql`CREATE INDEX run_status_created_at_idx ON run (status, created_at)`.execute(db);
  await sql`CREATE INDEX run_tick_id_idx ON run (tick_id)`.execute(db);

  await sql`
    CREATE TABLE run_step (
      run_id uuid NOT NULL REFERENCES run (id),
      position integer NOT NULL CHECK (position >= 1),
      tool_id uuid NOT NULL REFERENCES tool (id),
      tool_version_id uuid NOT NULL REFERENCES tool_version (id),
      status text NOT NULL DEFAULT 'not_reached'
        CHECK (status IN ('running', 'passed', 'failed', 'refused', 'not_reached')),
      input jsonb NOT NULL DEFAULT '[]'::jsonb,
      result jsonb NOT NULL DEFAULT '[]'::jsonb,
      error text,
      started_at timestamptz,
      finished_at timestamptz,
      PRIMARY KEY (run_id, position)
    )
  `.execute(db);

  await sql`
    CREATE TABLE handled_item (
      process_id uuid NOT NULL REFERENCES process (id),
      item_id text NOT NULL,
      outcome text NOT NULL CHECK (outcome IN ('passed', 'set_aside')),
      run_id uuid NOT NULL REFERENCES run (id),
      at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (process_id, item_id)
    )
  `.execute(db);

  await sql`
    CREATE TABLE repair (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tool_id uuid NOT NULL REFERENCES tool (id),
      process_id uuid NOT NULL REFERENCES process (id),
      monster_run_id uuid NOT NULL UNIQUE REFERENCES monster_run (id),
      from_version_id uuid NOT NULL REFERENCES tool_version (id),
      to_version_id uuid REFERENCES tool_version (id),
      failed_run_id uuid NOT NULL REFERENCES run (id),
      retry_run_id uuid REFERENCES run (id),
      item_label text NOT NULL,
      what_failed text NOT NULL,
      what_changed text NOT NULL,
      result text NOT NULL CHECK (result IN ('verified', 'not_fixed')),
      reason text,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (
        (result = 'not_fixed' AND reason IS NOT NULL)
        OR (result = 'verified' AND reason IS NULL)
      )
    )
  `.execute(db);
  await sql`CREATE INDEX repair_tool_created_at_idx ON repair (tool_id, created_at)`.execute(db);
  await sql`CREATE INDEX repair_process_id_idx ON repair (process_id)`.execute(db);

  await sql`
    CREATE TABLE refusal (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site text NOT NULL,
      stage text NOT NULL CHECK (stage IN ('install', 'run', 'explore')),
      at timestamptz NOT NULL DEFAULT now(),
      tool_name text,
      tool_version integer,
      process_id uuid NOT NULL REFERENCES process (id),
      run_id uuid REFERENCES run (id),
      monster_run_id uuid REFERENCES monster_run (id),
      CHECK (run_id IS NOT NULL OR monster_run_id IS NOT NULL)
    )
  `.execute(db);
  await sql`CREATE INDEX refusal_at_idx ON refusal (at)`.execute(db);
  await sql`CREATE INDEX refusal_run_id_idx ON refusal (run_id)`.execute(db);
  await sql`CREATE INDEX refusal_monster_run_id_idx ON refusal (monster_run_id)`.execute(db);

  await sql`ALTER TABLE process ADD COLUMN cause_run_id uuid REFERENCES run (id)`.execute(db);
  await sql`ALTER TABLE process ADD COLUMN cause_refusal_id uuid REFERENCES refusal (id)`.execute(
    db,
  );
  await sql`ALTER TABLE process ADD COLUMN verification_run_id uuid REFERENCES run (id)`.execute(
    db,
  );
  await sql`ALTER TABLE process ADD COLUMN latest_repair_id uuid REFERENCES repair (id)`.execute(
    db,
  );
  await sql`
    ALTER TABLE process
    ADD CONSTRAINT process_cause_run_id_when_needed
    CHECK (
      (status = 'needs_human' AND cause_run_id IS NOT NULL)
      OR (status <> 'needs_human' AND cause_run_id IS NULL)
    )
  `.execute(db);

  await sql`
    ALTER TABLE monster_run
    ADD CONSTRAINT monster_run_failed_run_id_fkey
    FOREIGN KEY (failed_run_id) REFERENCES run (id)
  `.execute(db);
  await sql`
    ALTER TABLE monster_run
    ADD CONSTRAINT monster_run_failed_run_when_repair
    CHECK (
      (kind = 'repair' AND failed_run_id IS NOT NULL)
      OR (kind = 'learn' AND failed_run_id IS NULL)
    )
  `.execute(db);

  await sql`ALTER TABLE run ADD CONSTRAINT run_repair_id_fkey FOREIGN KEY (repair_id) REFERENCES repair (id)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE run DROP CONSTRAINT IF EXISTS run_repair_id_fkey`.execute(db);
  await sql`ALTER TABLE monster_run DROP CONSTRAINT IF EXISTS monster_run_failed_run_when_repair`.execute(
    db,
  );
  await sql`ALTER TABLE monster_run DROP CONSTRAINT IF EXISTS monster_run_failed_run_id_fkey`.execute(
    db,
  );
  await sql`ALTER TABLE process DROP CONSTRAINT IF EXISTS process_cause_run_id_when_needed`.execute(
    db,
  );
  await sql`ALTER TABLE process DROP COLUMN IF EXISTS latest_repair_id`.execute(db);
  await sql`ALTER TABLE process DROP COLUMN IF EXISTS verification_run_id`.execute(db);
  await sql`ALTER TABLE process DROP COLUMN IF EXISTS cause_refusal_id`.execute(db);
  await sql`ALTER TABLE process DROP COLUMN IF EXISTS cause_run_id`.execute(db);
  await sql`DROP TABLE IF EXISTS refusal`.execute(db);
  await sql`DROP TABLE IF EXISTS repair`.execute(db);
  await sql`DROP TABLE IF EXISTS handled_item`.execute(db);
  await sql`DROP TABLE IF EXISTS run_step`.execute(db);
  await sql`DROP TABLE IF EXISTS run`.execute(db);
  await sql`DROP TABLE IF EXISTS tick`.execute(db);
}
