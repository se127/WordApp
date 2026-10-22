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

## No comments — never write any

- Never add a comment to any file in this project: no `//`, `/* */`, `{/* */}`,
  `<!-- -->`, `#`, or any other comment syntax, in code, tests, scripts, config,
  styles, or markup. This includes JSDoc and documentation comments — express
  intent through clear names and structure instead.
- When you edit a file and find an existing comment, remove it as part of the edit —
  never keep, move, copy, translate, or adapt one.
- The only exception is a functional directive that a tool consumes, such as
  `// eslint-disable-next-line ...`, `// @ts-expect-error`, `// prettier-ignore`, or
  `// @vitest-environment ...`: keep it exactly as it is, because removing it breaks
  the tool, and never add a new one unless the tool cannot work without it.

## Farsi text — never use zero-width characters

- In any Farsi (Persian) text anywhere in this project (UI copy, docs, comments, code
  strings), never use zero-width characters: ZWNJ (zero-width non-joiner, U+200C), ZWSP
  (zero-width space, U+200B), or ZWJ (zero-width joiner, U+200D). These are the invisible
  "half space" (نیم فاصله) characters.
- Always type a normal space instead. Write `می روم`, never the version with a hidden
  zero-width character between `می` and `روم`.

## Farsi text — sentence punctuation

- End every Farsi (Persian) sentence with its final punctuation: a period (`.`) for
  statements and the question mark (`؟`) for questions. Never leave a sentence bare:
  write `سند حذف شد.`, never `سند حذف شد`.
- Texts that mark an action in progress keep their trailing `...`: `در حال بارگذاری...`,
  `در حال ساخت سند...`, and `در حال حذف...` stay as they are.
- Short labels carry no final punctuation — button text (`افزودن سند`, `انصراف`, `بله`),
  tooltips and aria-labels (`گزینه ها`, `تغییر پوسته`, `تلاش دوباره برای بارگذاری سند`),
  and the untitled document title (`بدون عنوان`).

## Never run the dev or dist scripts

- Never run the dev server or the installer build (`bun dev`, `bun run dev`, `vite`,
  `bun run dist`, `electron-builder`) — not even for verification. The user runs the app
  and builds installers themselves.
- `bun run build` and `bun run test` are the only exceptions: they compile or test the
  code without launching Electron, and they are required by the pre-commit checks below.

## Database features — account for `--db-delay`

The dev script's `--db-delay=<milliseconds>ms` flag (e.g. `bun dev --db-delay=2000ms`)
makes every database operation wait before it runs, so slow reads and writes can be
watched by hand in the UI. Features that touch the database layer must keep that
coverage — the delay reaches `openDatabase` (`electron/database.ts`) as
`operationDelayMs`:

- Every operation that runs a query must be asynchronous and start by awaiting
  `waitBeforeQuery()`; that is the only place the delay enters, so an operation that
  skips it silently escapes `--db-delay`.
- Build the UI so a slow operation is visible and harmless: every read and write shows
  a loading or busy state while it is in flight (the create button's spinner, the
  document page's pending spinner, and the heading's loader/pulse are the shapes to
  follow). The page must never blank out or silently wait.
- Pin that state in a test by holding the operation open, the way the spinner tests in
  `tests/dom/routes.test.tsx` do.
- After every write, invalidate the queries it changed (`src/lib/query.ts`; stale times
  are infinite, so a missed invalidation leaves the UI on old data).
- Never run the dev script to watch the delay yourself — manual `--db-delay` runs
  belong to the user (see "Never run the dev or dist scripts" above).

## Database features — account for `--with-db-failure`

The dev script's `--with-db-failure` flag (`bun dev --with-db-failure`) prompts for
the store operations that should fail and makes the picked ones fail for the run
(their names reach `openDatabase` as `failingOperations`). When you add or change an
operation that runs a query, ask the user whether the knob should cover it before
implementing it — never decide that on your own. If it should:

- Add its name to `databaseOperationNames` and call
  `failInjectedOperation('<name>')` right after `await waitBeforeQuery()`; the
  failure lands after the delay, like a slow query that then fails. An operation left
  out of the list still starts with `await waitBeforeQuery()` — only the injection is
  skipped, so `--db-delay` keeps covering it.
- An offered operation's failure must be visible and harmless in the UI — the same
  rule as a slowed operation: the home page answers a failed create with the error
  toast and a failed count with the retry button, and the document page answers a
  failed read with its failure message and retry button. The page must never blank
  out or silently wait.
- The list is pinned by tests — the names/parse tests in
  `tests/node/database.test.ts`, the "valid operations" messages in
  `tests/node/main.test.ts`, and the prompt fixture in
  `tests/node/db-failure-prompt.test.ts`. Update them in the same commit when the
  list changes.
- Never run the dev script to watch a failure yourself — manual `--with-db-failure`
  runs belong to the user (see "Never run the dev or dist scripts" above).

## shadcn/ui components — `src/components/ui` is off-limits

- Never touch the shadcn components in `src/components/ui` — no edits, refactors, fixes,
  moves, or anything else, ever. Treat them as read-only vendored code.
- At the start of every session, read the shadcn components in `src/components/ui` to be
  familiar with how to use them: which components exist and their props, structure, and
  exports.

## Editor toolbar — every action returns focus to the editor

- Any toolbar action that changes the editor — a plain button, a dropdown menu item,
  or an option in a select — must leave focus in the ProseMirror editor.
- This includes choosing the option that is already active.
- Do not rely only on `chain().focus()` while an overlay is open: Radix restores focus
  when the overlay closes and can undo it. Mark the selection, then focus the editor
  from `onCloseAutoFocus`; follow `useEditorFocusAfterToolbarSelection` in
  `src/components/document-body-editor.tsx`.
- Closing a menu or select without choosing an option returns focus to its trigger, not
  the editor.
- Pin the behavior in tests with
  `expect(await editorTextbox()).toHaveFocus()` after each toolbar button and option,
  including the already-active option and a keyboard selection.

## React Compiler — keep renderer code compilable

`vite.config.ts` runs the React Compiler over `src/**` through
`@rolldown/plugin-babel`, using the `reactCompiler` preset it exports. Memoization only
reaches the components the compiler actually compiles, so keep that wiring intact and
treat every skip as a bug:

- After changing anything under `src/`, run `bun run check:react-compiler`. It
  transforms every renderer file with the same preset as the build (it imports
  `reactCompiler` from `vite.config.ts`) and reports, per file, every function the
  compiler compiled — with memo slot counts — and every failure or skip. It exits
  non-zero on unexpected failures, so it is the gate.
- Vitest does not run the compiler (`vitest.config.ts`), so the check script is the
  proof that changed renderer code is compiled; `tests/node/react-compiler-check.test.ts`
  pins that every file compiles and that the app root and pages stay memoized.
- The compiler cannot compile `try`/`finally` — it skips the whole function — so async
  cleanup in handlers uses promise `.finally()`, as in `addDocument`
  (`src/pages/home.tsx`) and `deleteDocument` (`src/components/document-options.tsx`).
  Never add a new `try`/`finally` in renderer code and never convert those two back.
- Never write `'use no memo'` or `'use no forget'` directives, and never silence
  `react-hooks/rules-of-hooks` or `react-hooks/exhaustive-deps` with an
  `eslint-disable-next-line` — the compiler treats both as opt-outs and skips the
  function.
- `scripts/react-compiler-check.ts` pins accepted skips — currently only TanStack
  Virtual's `useVirtualizer()`, which the compiler never memoizes on purpose. The check
  fails when a pinned skip stops matching, so remove stale entries; never add a new
  accepted skip without asking the user first.
- Keep `@babel/core` on 7.x (`package.json`): with Babel 8 the compiler bails out on
  code that destructures with defaults and silently leaves those functions uncompiled.

## Status and loading text — never gray

- Spinners, «در حال ...» text, and empty-state sentences (like
  «هنوز سندی ثبت نشده است.») use the primary text color, the same
  black-on-light / white-on-dark as the «مستندات» heading. Leave them with no color
  class so they inherit `text-foreground`; never style them `text-muted-foreground`.
- `text-muted-foreground` (gray) is only for deliberately secondary text placed
  directly under its primary counterpart, the way an `AlertDialogDescription` sits
  lighter under its `AlertDialogTitle`. When in doubt, use the primary color.

## Toast actions — full width below the message

- Never use Sonner's inline `action` option for an actionable toast: it renders a small
  label beside the message.
- Put the action in the toast's `description` as a full-width `Button` below the
  message, using `variant="outline"`, `size="sm"`, and
  `className="mt-1 w-full text-foreground"`. Dismiss the toast in the click handler
  before running the action.
- Pin the full-width button with `w-full` together with its label in a test.

## Loading icons — always `size-4`

- Every loading icon in the app renders at 16px: write `size-4` on the icon itself
  (`LoaderCircle`, a spinning `RefreshCw`) — even inside a `Button`, instead of
  leaving the size to the parent. `animate-spin` is what marks it as loading.
- Never give a loader another size — no `size-3`, `size-5`, `size-6`, `size-8`, no
  `h-*`/`w-*` overrides. One shared size keeps every loading state identical.
- `animate-pulse` stays reserved for stale content that keeps its data on screen
  while it re-reads (the table and the count in `src/pages/home.tsx`). The spinner
  tests in `tests/dom/routes.test.tsx` pin `size-4` together with `animate-spin`.

## Numbers — format every visible number with `formatNumber`

- Every number the app itself renders as text must go through `formatNumber`
  (`src/lib/number.ts`), except the date and clock parts covered below. Do not limit
  this to counts and amounts that can plausibly pass 999: it applies to headings, table
  cells, pagination, buttons, menus, dialog titles and descriptions, toasts, tooltips,
  placeholders, empty/loading/status messages, and `aria-label`/`title`/`alt`
  attributes. `3`, `12`, and `3000` show as `۳`, `۱۲`, and `۳٬۰۰۰`.
- Format the value where the copy is assembled, including numbers inside a sentence:
  `` `${formatNumber(count)} سند حذف شد.` ``. A raw `{count}`, `String(value)`, or
  template interpolation in user-facing text is a bug even below 1000, because it leaks
  Latin digits.
- Default `formatNumber` groups thousands and is for counts and amounts. Pass
  `{ group: false }` wherever a separator would be wrong — relative-time units
  (`۵ دقیقه ی پیش`) and other numeric identifiers. `formatRelativeTime`
  (`src/lib/date.ts`) is the shape to follow.
- Never hand-roll digits or grouping — no bare `toLocaleString()` (it follows the OS
  locale), no regex or digit replacement, no `Intl.NumberFormat` built at a call site,
  no manual `۰۱۲...` mapping. `formatNumber` pins `fa-IR`, so the output is Persian
  digits with the `٬` thousands separator in every runtime.
- Date and clock parts are the one exception: `formatAbsoluteDate` (`src/lib/date.ts`)
  formats them with `Intl.DateTimeFormat`, keeps their current Latin digits, and never
  groups them, so a Persian year stays `1405`, never `1,405`. Do not pass date or clock
  parts through `formatNumber`.
- User-authored content is data, not UI copy: document titles, bodies, and search terms
  may contain any digits and must be rendered exactly as stored. Never run them through
  `formatNumber` or rewrite their digits, including when they are interpolated into tab
  labels, checkbox labels, or delete-dialog titles. IDs used only in routes, query keys,
  or IPC are not visible text.
- Every new visible number needs a test that pins the rendered text, so Latin digits or
  a raw value cannot slip back in.

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

Before any commit, run all five and fix whatever they report:

1. Lint: `bun run lint` — fix all reported problems.
2. Format: `bun run format` (Prettier) — fix all reported problems.
3. Tests: `bun run test` (Vitest) — all tests must pass.
4. React Compiler: `bun run check:react-compiler` — every renderer file must compile;
   fix what it reports, and never pin a new accepted skip without asking.
5. Build: `bun run build` — must finish successfully.

If any check fails, you are not allowed to commit. Fix the problems first, then re-run
all five checks, and repeat until everything passes.

## Commit messages — always detailed

- Every commit is a short subject line followed by a body that explains the change.
  Never commit with a one-line message, not even for a small fix or a documentation
  update.
- Write the message in English. Keep the subject as one summary line, then one blank
  line, then the body wrapped at 72 characters.
- The body answers what changed, why it changed, and how: the behavior added or
  removed, the edge cases now covered, the tests that pin it, and the reasoning
  behind any choice the diff alone cannot show. Describe only what actually landed;
  re-read the staged diff before writing.
- When the commit covers several concerns, open with one sentence and list the parts
  as `-` bullets, one per concern.
- Write for the person reading `git log` a year from now: explain intent, not a
  restatement of file names.

## Never commit without permission

- Always ask the user for explicit permission before running `git commit`, even when all
  pre-commit checks pass.
