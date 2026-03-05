# SERVFIX

## Project info

- App URL: https://lilqyn.github.io/servfix
- Admin URL: https://lilqyn.github.io/servfix/admin
- API URL: Set via `VITE_API_BASE` (example: `https://api.servfixgh.com`)

## How can I edit this code?

You can use your preferred IDE, GitHub’s web editor, or Codespaces.

## Local development

Requirements: Node.js 18+ and npm.

1. Clone the repository.
2. Install dependencies: `npm i`
3. Create `.env` from `.env.example` and fill in required values.
4. Start the frontend: `npm run dev`
5. Start the API: `npm run dev:server`

Optional:

- Generate Prisma client: `npx prisma generate`
- Run migrations: `npx prisma migrate dev`

## What technologies are used for this project?

- Vite
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
- Express
- Prisma

## Deployment

1. Build the frontend: `npm run build`
2. Build the server: `npm run build:server`
3. Start the API: `npm run start:server`
4. Serve the frontend output from `dist/` using your hosting provider.

## Mobile rollout docs

- Cheapest-first mobile plan: `docs/mobile-rollout.md`
- Android Play Store scaffold (TWA): `docs/android-twa.md`
- Mobile order-payment E2E runbook: `docs/mobile-order-payment-e2e.md`

## Resilience testing docs

- AWS ECS fault-injection guide: `docs/fis-ecs.md`
