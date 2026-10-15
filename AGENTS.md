# Project rules

## Bun only — never npm, npx, yarn, pnpm, or node

- Use Bun for everything: `bun install`, `bun add`, `bun run <script>`, `bun test`,
  `bunx <pkg>`, `bun <file.ts>`.
- Never invoke `npm`, `npx`, `yarn`, `pnpm`, or `node`, not even for one-off commands or
  scripts. Use the Bun equivalent instead: `node x.js` → `bun x.js`, `npx pkg` → `bunx pkg`,
  `npm run x` → `bun run x`.
- Only fall back to Node/npm when the user explicitly asks for it.

## Install packages as devDependencies by default

- Add every package with `bun add -d <pkg>` (devDependency). The renderer is bundled
  by Vite and `electron/main.ts` + `electron/preload.ts` are bundled by `bun build`
  (`scripts/electron.ts`), so almost nothing needs to exist in the packaged app's
  `node_modules`.
- Only use `bun add <pkg>` (production dependency) when the package must be present
  in `node_modules` inside the packaged app at runtime. That is essentially limited
  to:
  - native modules (`*.node` binaries) used by the main/preload process, e.g.
    `better-sqlite3`, `sharp` — native binaries cannot be bundled;
  - packages that cannot be bundled because they read their own files at runtime
    (e.g. `__dirname`-relative assets, `.wasm`) and are required unbundled by the
    main process.
- Renderer packages are never production dependencies: the renderer runs in a
  browser-like context without `node_modules`.
- If a production dependency is ever added, also set `"npmRebuild": true` in the
  `build` config of `package.json` so electron-builder rebuilds native modules
  against Electron's ABI.
- `electron` itself must stay a devDependency (electron-builder expects it there);
  the Electron runtime ships inside the packaged app.

## App name: WordApp

- Always write the app name exactly as `WordApp` — uppercase `W` and `A` — in every context
  where the name appears: UI copy, page titles, docs, comments, code identifiers.
- If and only if a context does not allow that casing (for example npm package names or
  URLs, which must be lowercase), use `wordapp`.
- No other variant is allowed: `Wordapp`, `wordApp`, `WORDAPP`, `word-app`, etc.

## Never run the dev or dist scripts

- Never run the dev server or the installer build (`bun dev`, `bun run dev`, `vite`,
  `bun run dist`, `electron-builder`) — not even for verification. The user runs the app
  and builds installers themselves.
- `bun run build` is the only exception: it compiles the renderer and the main/preload
  bundles but never launches Electron, and it is required by the pre-commit checks below.

## shadcn/ui components — `src/components/ui` is off-limits

- Never touch the shadcn components in `src/components/ui` — no edits, refactors, fixes,
  moves, or anything else, ever. Treat them as read-only vendored code.
- At the start of every session, read the shadcn components in `src/components/ui` to be
  familiar with how to use them: which components exist and their props, structure, and
  exports.

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
