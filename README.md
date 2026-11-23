# THE LAST SHADOW — CASE FILE 017

## New game application (React / TypeScript / Vite)
The new cinematic investigator application is being built on the branch `game/react-foundation`. The original static investigator experience is preserved at `legacy.html`; the separate administrator files remain available as `admin.html`, `admin.js`, and `admin.css`.

### Run locally
1. Install Node.js 20.19+ or 22.12+.
2. Copy `.env.example` to `.env.local`.
3. Set `VITE_SUPABASE_ANON_KEY` to the publishable/anon key from the Supabase project configured in `VITE_SUPABASE_URL`.
4. Run `npm install`, then `npm run dev`.
5. Run `npm run build` for a production build.

Never put a Supabase service_role key in a VITE_ variable or browser code.

## Architecture audit
See `docs/ARCHITECTURE-AUDIT.md` for the current baseline and migration strategy.

## Legacy application
- `legacy.html`: original investigator interface snapshot.
- `admin.html`: existing administrator interface.
- `app.js`, `data.js`, `style.css`, `glass.css`: original vanilla-JS application and visual system.
- `assets/`: original Case 017 art and map assets.
- `supabase/`: existing SQL upgrade scripts; they are retained and have not been applied automatically.

## Current scope
The React foundation includes the cinematic loading sequence, bilingual Arabic/English authentication shell, headquarters navigation, and six-digit case-code RPC integration. Case content, profiles, realtime rooms, evidence workspace, voice, admin, and production deployment remain subsequent implementation stages and are not represented as completed features.
