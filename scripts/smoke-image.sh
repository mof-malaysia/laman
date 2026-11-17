#!/usr/bin/env bash
# Boot check of a built Laman image, run by .github/workflows/release.yml before
# it pushes, and by hand against a local build:
#
#   docker build -t laman:smoke . && scripts/smoke-image.sh laman:smoke
#
# Starts the image as compose.yaml does (init, /data and /backups mounted,
# SUPER_ADMIN_* and SITE_URL set) with throwaway volumes, waits for the image's
# own HEALTHCHECK (/healthz) to pass within its start period, then runs
# `laman check` inside it. Not a test suite: the pre-push hook ran those.
set -euo pipefail

image=${1:?usage: smoke-image.sh <image>}
name=laman-smoke-$$
# The Dockerfile's HEALTHCHECK --start-period, in seconds.
start_ns=$(docker image inspect --format '{{with .Config.Healthcheck}}{{json .StartPeriod}}{{end}}' "$image")
if [ -z "$start_ns" ] || [ "$start_ns" = 0 ]; then
  echo "$image has no HEALTHCHECK start period" >&2
  exit 1
fi
start_period=$((start_ns / 1000000000))

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "--- container logs ---"
    docker logs "$name" 2>&1 || true
  fi
  # -v removes the anonymous /data and /backups volumes with it.
  docker rm -f -v "$name" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

# --health-interval only makes the image's check run every second, not every 30.
docker run --detach --init --name "$name" --health-interval 1s \
  --volume /data --volume /backups \
  --env SUPER_ADMIN_USERNAME=smoke \
  --env SUPER_ADMIN_PASSWORD="$(openssl rand -hex 16)" \
  --env SITE_URL=http://localhost:8080 \
  "$image" >/dev/null

for _ in $(seq "$start_period"); do
  state=$(docker inspect --format '{{.State.Status}} {{.State.Health.Status}}' "$name")
  case $state in
    "running healthy")
      echo "/healthz is OK"
      docker exec "$name" laman check
      exit 0
      ;;
    "running starting") sleep 1 ;;
    *)
      echo "The container isn't healthy: $state" >&2
      exit 1
      ;;
  esac
done

echo "/healthz wasn't OK within ${start_period}s" >&2
exit 1
