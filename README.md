# STAR MEDIA CRM

Premium internal CRM & finance operations platform for a media / influencer agency.  
Built with the MERN stack: **MongoDB · Express · React · Node.js**.

## Features

- Domain-restricted auth, invites, JWT + refresh cookies, TOTP MFA, password policy, RBAC
- CEO & employee dashboards (server-side aggregations)
- Clients, leads pipeline, projects, tasks (Kanban + table), time logs
- Finance: transactions, invoices (PDF/payments), vendors, contracts, payroll, bank accounts, P&L export
- Generic CEO approval engine
- Analytics charts, alert engine (cron), notifications, audit log
- Light/dark theme, command palette, responsive SaaS UI

## Quick start

### Prerequisites

- Node.js 20+
- MongoDB (local or Docker)
- npm 10+

### 1. Install

```bash
npm install
cp .env.example .env
```

### 2. Start MongoDB

```bash
docker compose up -d
```

Or use any MongoDB URI in `.env` (`MONGODB_URI`).

### 3. Run

```bash
npm run dev
```

- Client: http://localhost:5173  
- API: http://localhost:5001/api/v1/health  

Create the first admin from the app (CEO invite / add employee) or insert a user in MongoDB. Only `@starmediainfluencer.com` emails are accepted by default (configurable in Settings / `.env`).

## Scripts

| Command         | Description           |
|-----------------|-----------------------|
| `npm run dev`   | API + Vite client     |
| `npm run build` | Build server + client |

## Monorepo layout

```
starmediacrm/
  client/   React 18 + Vite + Tailwind + TanStack Query
  server/   Express + Mongoose + Socket.IO + cron jobs
```

## Acceptance checks

1. Login with `user@gmail.com` → rejected (domain)
2. Login as CEO → MFA setup available under Security
3. Employee opens `/finance` → blocked (UI + API 403)
4. Create/assign task → appears on board; status changes notify
5. Create invoice + partial payment → status `partially_paid`
6. CEO → Alerts → “Run engine now” → overdue invoice alerts
7. Employee submits expense → appears in Approvals; CEO approve updates status
8. Payroll approve + disburse → liability drops
9. CEO dashboard date range chips refresh KPIs from API
10. Finance → Export CSV / PDF
11. Theme toggle + mobile sidebar layout
12. CEO Audit Log shows recorded actions

## Production deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Vercel + Render + MongoDB Atlas + Cloudinary setup, env vars, and post-deploy checks.

## Notes

- Google OAuth: set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`
- Email: configure SMTP; without it, messages are logged via JSON transport
- File uploads: use `STORAGE_PROVIDER=cloudinary` on Render (ephemeral disk); `local` is fine for laptop/dev
- Currency formatting defaults to INR (en-IN)
- Never commit real API keys — keep secrets in local `.env` / host dashboards only
