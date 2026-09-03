#!/bin/sh
# Push the Prisma schema to $DATABASE_URL on boot (this project has no
# migrations folder — `db push` IS the schema sync), then exec the app.
set -e
echo "[entrypoint] syncing database schema"
npx prisma db push --skip-generate
echo "[entrypoint] starting ${npm_package_name:-raktsetu}"
exec "$@"
