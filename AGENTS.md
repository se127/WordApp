# Project rules

## Bun only — never npm, npx, yarn, pnpm, or node

- Use Bun for everything: `bun install`, `bun add`, `bun run <script>`, `bun test`,
  `bunx <pkg>`, `bun <file.ts>`.
- Never invoke `npm`, `npx`, `yarn`, `pnpm`, or `node`, not even for one-off commands or
  scripts. Use the Bun equivalent instead: `node x.js` → `bun x.js`, `npx pkg` → `bunx pkg`,
  `npm run x` → `bun run x`.
- Only fall back to Node/npm when the user explicitly asks for it.

## App name: WordApp

- Always write the app name exactly as `WordApp` — uppercase `W` and `A` — in every context
  where the name appears: UI copy, page titles, docs, comments, code identifiers.
- If and only if a context does not allow that casing (for example npm package names or
  URLs, which must be lowercase), use `wordapp`.
- No other variant is allowed: `Wordapp`, `wordApp`, `WORDAPP`, `word-app`, etc.

## Never run the dev or preview scripts

- Never run the dev or preview servers (`bun dev`, `bun preview`, `bun run dev`,
  `bun run preview`, `vite`, `vite preview`) — not even for verification. The user runs
  the app themselves.

## Pre-commit checks — mandatory, in this order

Before any commit, run all three and fix whatever they report:

1. Lint: `bun run lint` — fix all reported problems.
2. Format: `bun run format` (Prettier) — fix all reported problems.
3. Build: `bun run build` — must finish successfully.

If any check fails, you are not allowed to commit. Fix the problems first, then re-run
all three checks, and repeat until everything passes.

## Never commit without permission

- Always ask the user for explicit permission before running `git commit`, even when all
  pre-commit checks pass.
