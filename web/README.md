# Alea Market Screener

Internal screener + researchability score tool for Polymarket events.

## Setup

```bash
cp .env.example .env
npm install
npm run db:migrate
```

## Ingestion

```bash
npm run sync
```

## Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## Config

Edit scoring + sector settings in `config/app-config.json`.

## Notes

- Set `BASIC_AUTH_USER` + `BASIC_AUTH_PASS` in `.env` to enable basic auth.
- `DATABASE_URL` must point to Postgres (recommended for Vercel).
  - Vercel Neon/Postgres integrations also provide `POSTGRES_URL`, which is used automatically.

## Vercel deploy

1. Create a new Vercel project and set the root directory to `web/`.
2. Provision Vercel Neon (Postgres) or another managed Postgres.
3. Run migrations once from your machine using a direct URL:
   - `DATABASE_URL=<non_pooling_url> npm run db:migrate`
4. Add env vars on Vercel: `BASIC_AUTH_USER`, `BASIC_AUTH_PASS`, `SYNC_TOKEN`.
   - If using the Neon integration, it sets `POSTGRES_URL` automatically.
5. Configure a Vercel Cron job to hit `/api/sync` every 30–60 minutes.
   - Manual runs: `curl -H "Authorization: Bearer $SYNC_TOKEN" https://<your-app>/api/sync`
   - Default schedule lives in `vercel.json` (every 30 minutes).
