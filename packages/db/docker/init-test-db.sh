#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
SELECT 'CREATE DATABASE imortal_vampires_spawning_frankenstains_test'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'imortal_vampires_spawning_frankenstains_test'
)\gexec
SQL
