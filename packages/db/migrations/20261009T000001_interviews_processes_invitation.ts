import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE interview (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      status text NOT NULL DEFAULT 'being_read'
        CHECK (status IN ('being_read', 'proposed', 'nothing_found')),
      read_started_at timestamptz,
      read_error text,
      language text NOT NULL,
      transcript jsonb NOT NULL,
      started_at timestamptz NOT NULL,
      ended_at timestamptz NOT NULL,
      continued_from_id uuid REFERENCES interview (id),
      invited_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX interview_status_created_at_idx ON interview (status, created_at)`.execute(
    db,
  );

  await sql`
    CREATE TABLE process (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      interview_id uuid NOT NULL REFERENCES interview (id),
      position integer NOT NULL,
      name text NOT NULL,
      description text NOT NULL,
      success_criterion text NOT NULL,
      status text NOT NULL DEFAULT 'proposed'
        CHECK (status IN (
          'proposed', 'queued', 'learning', 'awaiting_seal', 'failed_to_learn',
          'sealed', 'repairing', 'needs_human', 'retired'
        )),
      repaired boolean NOT NULL DEFAULT false,
      schedule_kind text NOT NULL CHECK (schedule_kind IN ('daily', 'every')),
      schedule_time text,
      schedule_minutes integer,
      next_run_at timestamptz,
      check_name text,
      check_description text,
      reason text,
      created_at timestamptz NOT NULL DEFAULT now(),
      sealed_at timestamptz,
      retired_at timestamptz,
      UNIQUE (interview_id, position),
      CHECK (
        (schedule_kind = 'daily'
          AND schedule_time IS NOT NULL
          AND schedule_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          AND schedule_minutes IS NULL)
        OR (schedule_kind = 'every'
          AND schedule_minutes IS NOT NULL
          AND schedule_minutes BETWEEN 1 AND 1440
          AND schedule_time IS NULL)
      ),
      CHECK (
        (status IN ('failed_to_learn', 'needs_human') AND reason IS NOT NULL)
        OR (status NOT IN ('failed_to_learn', 'needs_human') AND reason IS NULL)
      )
    )
  `.execute(db);
  await sql`CREATE INDEX process_status_idx ON process (status)`.execute(db);
  await sql`CREATE INDEX process_status_next_run_at_idx ON process (status, next_run_at)`.execute(
    db,
  );

  await sql`
    CREATE TABLE process_site (
      process_id uuid NOT NULL REFERENCES process (id) ON DELETE CASCADE,
      site text NOT NULL,
      kind text NOT NULL CHECK (kind IN ('website', 'connector')),
      login_needed boolean NOT NULL,
      PRIMARY KEY (process_id, site)
    )
  `.execute(db);
  await sql`CREATE INDEX process_site_site_idx ON process_site (site)`.execute(db);

  await sql`
    CREATE TABLE invitation_site (
      site text PRIMARY KEY,
      kind text NOT NULL CHECK (kind IN ('website', 'connector')),
      login_needed boolean NOT NULL,
      granted_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS invitation_site`.execute(db);
  await sql`DROP TABLE IF EXISTS process_site`.execute(db);
  await sql`DROP TABLE IF EXISTS process`.execute(db);
  await sql`DROP TABLE IF EXISTS interview`.execute(db);
}
