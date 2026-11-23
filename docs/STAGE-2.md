# Stage 2 — Visual shell and authentication foundation

Implemented:
- Cinematic boot/loading transition.
- Arabic RTL and English LTR interface switching.
- Responsive sign-in and investigator registration forms.
- Supabase Auth session persistence using project environment variables.
- Headquarters shell with case access panel.
- Six-digit case-code claim request through the server RPC `claim_case_code`.
- Honest empty states for profiles, extra cases, friends, and archive modules.
- PWA manifest generation and installable application shell.

Configuration needed:
- Add the publishable/anon key belonging to the requested Supabase project to `.env.local`.
- Confirm the existing database has the `claim_case_code(p_code, p_full_name)` RPC and that its RLS and rate limits have been applied safely.
- Live schema inspection is still pending; no database migration has been run by this branch.
