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

## Farsi text — never use zero-width characters

- In any Farsi (Persian) text anywhere in this project (UI copy, docs, comments, code
  strings), never use zero-width characters: ZWNJ (zero-width non-joiner, U+200C), ZWSP
  (zero-width space, U+200B), or ZWJ (zero-width joiner, U+200D). These are the invisible
  "half space" (نیم فاصله) characters.
- Always type a normal space instead. Write `می روم`, never the version with a hidden
  zero-width character between `می` and `روم`.

## Never run the dev or dist scripts

- Never run the dev server or the installer build (`bun dev`, `bun run dev`, `vite`,
  `bun run dist`, `electron-builder`) — not even for verification. The user runs the app
  and builds installers themselves.
- `bun run build` and `bun run test` are the only exceptions: they compile or test the
  code without launching Electron, and they are required by the pre-commit checks below.

## shadcn/ui components — `src/components/ui` is off-limits

- Never touch the shadcn components in `src/components/ui` — no edits, refactors, fixes,
  moves, or anything else, ever. Treat them as read-only vendored code.
- At the start of every session, read the shadcn components in `src/components/ui` to be
  familiar with how to use them: which components exist and their props, structure, and
  exports.

## Tests — always in step with the code

- Always write tests for the code you add or change, in the same commit. When you remove
  code, check whether its tests are now redundant and remove them too.
- Tests live in `tests/`, split by runtime: `tests/dom/` for renderer code (`src/**`,
  runs under happy-dom) and `tests/node/` for main/preload code (`electron/**`, runs
  under plain Node). Run them with `bun run test`; use `bun run test:watch` while
  developing.
- Coverage is opt-in: `bun run test:coverage` prints a per-file table and writes an
  HTML report to `coverage/`.
- Do not write tests for the vendored shadcn components in `src/components/ui` — they
  are installed code, not ours. Test the app's own behavior around them.

## Pre-commit checks — mandatory, in this order

Before any commit, run all four and fix whatever they report:

1. Lint: `bun run lint` — fix all reported problems.
2. Format: `bun run format` (Prettier) — fix all reported problems.
3. Tests: `bun run test` (Vitest) — all tests must pass.
4. Build: `bun run build` — must finish successfully.

If any check fails, you are not allowed to commit. Fix the problems first, then re-run
all four checks, and repeat until everything passes.

## Never commit without permission

- Always ask the user for explicit permission before running `git commit`, even when all
  pre-commit checks pass.
