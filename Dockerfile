# RaktSetu production image (used by docker-compose `--profile app`).
# Multi-stage build mirroring the vercel.json buildCommand: the Prisma schema
# is switched to the PostgreSQL provider before generate + build.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY src/packages/database/schema.prisma ./src/packages/database/schema.prisma
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time env: the app refuses to boot without APP_URL in production, and
# next build evaluates that validation (see .env.example / lib/env).
ENV APP_URL=https://build.raktsetu.invalid \
    APP_SECRET=build-only-secret-0123456789abcdef \
    NEXT_TELEMETRY_DISABLED=1
RUN node scripts/db-switch.mjs postgres && npx prisma generate && npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.mjs ./next.config.mjs
# Schema + prisma CLI stay available so the container can `db push` on boot.
COPY --from=build /app/src/packages/database/schema.prisma ./src/packages/database/schema.prisma
COPY scripts/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && apk add --no-cache openssl
EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
CMD ["npm", "start"]
