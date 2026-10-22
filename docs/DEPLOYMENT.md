# STAR MEDIA CRM — Deployment Guide

## Architecture

| Layer | Host | Notes |
| --- | --- | --- |
| Frontend | Vercel | Vite SPA (`client/`) |
| Backend | Render | Express API (`server/`) |
| Database | MongoDB Atlas | Connection string in `MONGODB_URI` |
| Files | Cloudinary (recommended) | Required on Render free (ephemeral disk) |

## Vercel (frontend)

1. Import the GitHub repo into Vercel.
2. Root directory: repository root (uses root `vercel.json`).
3. Build command: `npm run build -w client` (already in `vercel.json`).
4. Output directory: `client/dist`.
5. Environment variables:
   - `VITE_API_URL` = `https://<your-render-service>.onrender.com/api/v1`
   - Optional: `VITE_SOCKET_URL` = `https://<your-render-service>.onrender.com`
6. Redeploy after changing env vars (Vite bakes them at build time).

Never set JWT secrets, MongoDB URIs, Gemini/OpenAI keys, or Cloudinary secrets as `VITE_*` variables.

## Render (backend)

1. Create a Web Service from this repo, or use `render.yaml`.
2. Build: `npm install && npm run build -w server`
3. Start: `npm run start -w server`
4. Health check: `/health`
5. Set required env vars (see `server/.env.example`):
   - `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (≥32 chars, not placeholders)
   - `CLIENT_URL` = your Vercel origin(s), comma-separated
   - `API_URL` = this Render service URL
   - `COOKIE_SECURE=true`
   - `STORAGE_PROVIDER=cloudinary` + Cloudinary credentials
   - Optional: `GEMINI_API_KEY` / `OPENAI_API_KEY` for document OCR
6. Free-tier cold starts can add multi-second latency on the first request after idle.

## Post-deploy checklist

- [ ] `GET https://api…/health` returns `{ status: "ok" }`
- [ ] `GET https://api…/health/ready` reports Mongo connected
- [ ] Login + page refresh keeps session (7-day refresh cookie, `SameSite=None; Secure; Partitioned` cross-site)
- [ ] CEO / manager / employee role routes enforce permissions
- [ ] Upload image + PDF from Files and Finance; preview + download work
- [ ] Document scan (if AI keys set) returns editable extracted fields without auto-posting transactions
- [ ] CORS allows only your Vercel domain(s)
- [ ] No secrets in client bundle (search built JS for `JWT_`, `mongodb`, `GEMINI`)

## Secret rotation

If a key was ever committed (example files, chat, screenshots):

1. Rotate the key in the provider console (Gemini / OpenAI / Cloudinary / MongoDB / SMTP).
2. Update Render / Vercel env vars.
3. Redeploy.
4. Do **not** force-push history rewrite unless you explicitly authorize it.
