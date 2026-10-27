#!/bin/bash
# Runs on the server (via SSM) for every release: deploy.sh <image-uri> <aws-region>
set -euo pipefail

IMAGE="$1"
REGION="$2"
APP_DIR=/opt/employee-dashboard
PARAM_PATH=/employee-dashboard
cd "$APP_DIR"

# Internal secrets are generated once on the server and never leave it.
if [ ! -f secrets.env ]; then
  umask 077
  {
    for name in POSTGRES_PASSWORD PG_AUTH_PASSWORD PG_API_PASSWORD PG_CRM_PASSWORD PG_HELPDESK_PASSWORD SERVICE_TOKEN; do
      echo "$name=$(openssl rand -hex 24)"
    done
    echo "JWT_SECRET=$(openssl rand -hex 48)"
  } > secrets.env
fi

# Settings and the seed password come from SSM Parameter Store.
aws ssm get-parameters-by-path --region "$REGION" --path "$PARAM_PATH" --with-decryption \
  --query 'Parameters[*].[Name,Value]' --output text \
  | while IFS=$'\t' read -r name value; do echo "${name##*/}=${value}"; done > params.env

for required in API_DOMAIN DASHBOARD_URL SEED_PASSWORD; do
  grep -q "^${required}=" params.env || { echo "Missing parameter ${PARAM_PATH}/${required}" >&2; exit 1; }
done

umask 077
{ cat secrets.env params.env; echo "IMAGE=${IMAGE}"; } > .env
rm -f params.env

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${IMAGE%%/*}"

docker compose pull --quiet
docker compose up -d --wait postgres
docker compose run --rm migrate
docker compose up -d --remove-orphans --wait
docker image prune -af --filter "until=168h" >/dev/null

echo "Deployed ${IMAGE}"
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
