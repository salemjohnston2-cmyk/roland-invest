# roland-invest
# Roland Invests — Prototype

Frontend on Vercel, backend on Render, SQLite on Render's persistent disk.

## Local development

### Backend
    cd server
    npm install
    npm start
    # runs on http://localhost:4000
    # admin credentials printed to console on first boot

### Frontend
    cd client
    npx serve .
    # or any static server; open http://localhost:3000

Edit `client/js/config.js` and set `window.API_BASE = "http://localhost:4000"` for local dev.

## Production

- Vercel root directory: `client`
- Render root directory: `server`
- Render persistent disk: mount at `/data`, 1 GB
- Render env vars:
  - `DB_PATH=/data/roland.db`
  - `CORS_ORIGIN=https://your-app.vercel.app`
  - `ADMIN_USER=admin`
  - `ADMIN_PASS=<generate one and keep it>
- Set `client/js/config.js` `window.API_BASE` to the Render URL before pushing to Vercel.

## Fonts

The CSS expects self-hosted fonts at `client/fonts/`. Download the two families from Google Fonts (OFL-licensed) and place the `.woff2` files there. Until then, system fonts are used gracefully.

## Health check

    GET https://<render-app>.onrender.com/health