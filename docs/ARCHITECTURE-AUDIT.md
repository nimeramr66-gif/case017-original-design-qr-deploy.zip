# THE LAST SHADOW — Architecture audit

Audit date: 2026-11-23

## Existing baseline
- Existing investigator interface is static HTML/CSS/vanilla JavaScript.
- Existing admin interface is separate: admin.html, admin.js, admin.css.
- Existing case materials are in data.js; the sealed envelope answers are intentionally withheld.
- Existing assets include a case cover, map, and character portraits.
- Existing SQL upgrade scripts are retained under supabase/.
- Some investigator progress is stored locally; this is not yet a synchronized multiplayer save.

## Configuration mismatch
Legacy app.js and admin.js point to Supabase project vzanygjerpvjehkxlzgr. The requested project is npwlgasrdpyxyknilnrx. The React app is configured to use the requested project URL and reads its matching public key from environment variables. Do not reuse the old project's key. The live database schema has not yet been inspected; the SQL files in this repository are not proof that the migrations were applied.

## Migration approach
- Preserve the legacy interface and admin application.
- Build the new React + TypeScript + Vite app on an isolated branch.
- Do not drop, rename, or rewrite existing database tables.
- Inspect the live schema and current RLS before creating additive migrations.
- Keep final-answer data and answer-validation logic server-side.
- Migrate case content from data.js only with source provenance and access-tier mapping.

## Foundation commit
React, TypeScript, Vite, Supabase Auth client, TanStack Query, Zustand, Zod, GSAP, Phaser, Tailwind CSS, and vite-plugin-pwa are added as the application foundation. The UI contains the cinematic boot sequence, bilingual login/signup shell, headquarters navigation, and a six-digit code claim call to the existing claim_case_code RPC. The Phaser gameplay scene and multiplayer features are not yet implemented.

## Pending
Live schema and RLS verification; profile persistence; authenticated case access; typed case content; evidence graph; interactive maps/timeline; final accusation RPC; friends and realtime rooms; LiveKit token service; admin migration; purchases; PWA validation; deployment.
