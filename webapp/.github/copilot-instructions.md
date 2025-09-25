# Copilot Instructions for douyin-trend-app/webapp

## Project Overview
- This is a Next.js app bootstrapped with `create-next-app`.
- Main entry point: `app/page.tsx` (edit to change homepage).
- Uses Next.js App Router (not Pages Router).
- Global styles: `app/globals.css`.
- Custom layout: `app/layout.tsx`.
- Static assets: `public/` (SVGs, icons).
- Shared React components: `src/components/`.
- Utility functions: `src/utils/` (e.g., `supabaseClient.ts` for Supabase integration).

## Developer Workflows
- **Start dev server:** `npm run dev` (or `yarn dev`, `pnpm dev`, `bun dev`).
- **Hot reload:** Changes to files in `app/` and `src/` auto-update the browser.
- **Build for production:** `npm run build`.
- **Preview production build:** `npm run start`.

## Patterns & Conventions
- Use functional React components (see `src/components/`).
- Data fetching and API calls should use Next.js conventions (e.g., server components, fetch in `app/` or `src/utils/`).
- Supabase is integrated via `src/utils/supabaseClient.ts` (use this for DB/auth).
- Font optimization via `next/font` and Geist font (see `README.md`).
- Prefer TypeScript for all new code (see `tsconfig.json`).
- Static assets (SVGs/icons) go in `public/`.

## Integration Points
- Supabase: Use `src/utils/supabaseClient.ts` for all DB/auth interactions.
- Next.js built-in features: routing, layouts, font optimization.
- Vercel: Recommended deployment platform (see `README.md`).

## Examples
- To add a new page, create a file in `app/` (e.g., `app/about/page.tsx`).
- To add a shared component, place it in `src/components/` and import as needed.
- For global styles, edit `app/globals.css`.

## References
- [Next.js Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Vercel Deployment](https://vercel.com/docs)

---
If any conventions or workflows are unclear, ask the user for clarification or examples from their codebase.
