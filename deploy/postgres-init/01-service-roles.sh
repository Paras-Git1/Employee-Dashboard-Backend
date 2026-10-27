#!/bin/sh
# Runs once, on the first start of an empty data volume.
# Each service gets its own login and database, and cannot connect to the others.
set -eu
for svc in auth api crm helpdesk; do
  eval "pw=\${PG_$(echo "$svc" | tr a-z A-Z)_PASSWORD}"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE ${svc}_svc LOGIN PASSWORD '${pw}';
CREATE DATABASE taskdash_${svc} OWNER ${svc}_svc;
REVOKE ALL ON DATABASE taskdash_${svc} FROM PUBLIC;
SQL
done
