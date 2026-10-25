# Project rules

## Tooling — Bun and dependencies

- Use Bun for everything: `bun install`, `bun add`, `bun run <script>`, `bun test`,
  `bunx <pkg>`, `bun <file.ts>`. Never invoke `npm`, `npx`, `yarn`, `pnpm`, or `node`,
  not even for one-off commands. Only fall back to Node/npm when the user explicitly
  asks.
- Add packages with `bun add -d <pkg>`. Vite bundles the renderer and `bun build`
  bundles `electron/main.ts` + `electron/preload.ts` (`scripts/electron.ts`), so the
  packaged app needs almost no `node_modules`. Renderer packages are never production
  dependencies.
- Use `bun add <pkg>` only for packages that must stay unbundled in the packaged app:
  native `*.node` modules used by main/preload (`better-sqlite3`, `sharp`) and packages
  that read `__dirname`-relative assets or `.wasm` at runtime. If one is added, set
  `"npmRebuild": true` in `package.json`'s `build` config.
- Keep `electron` a devDependency; its runtime ships inside the packaged app.

## Never run the dev or dist scripts

- Never run `bun dev`, `bun run dev`, `vite`, `bun run dist`, or `electron-builder`, not
  even for verification; the user runs the app and builds installers.
- `bun run test` and `bun run build` do not launch Electron, but they are not free
  verification steps: run them only through the end-of-batch pre-commit checks below,
  or when the user explicitly asks for that one check. Never run them mid-change on
  your own.

## Naming and source style

- Write the app name exactly as `WordApp` — uppercase `W` and `A` — in UI copy, titles,
  docs, comments, and identifiers. Use lowercase `wordapp` only where casing is forced
  (npm package, URLs); no other variant (`Wordapp`, `wordApp`, `WORDAPP`, `word-app`).
- Never add a comment to any file: no `//`, `/* */`, `{/* */}`, `<!-- -->`, `#`, or any
  other comment syntax in code, tests, scripts, config, styles, or markup, including
  JSDoc. Express intent through names and structure. Remove existing comments when
  editing; never keep, move, copy, or adapt one.
- Keep only functional directives a tool consumes (`// eslint-disable-next-line ...`,
  `// @ts-expect-error`, `// prettier-ignore`, `// @vitest-environment ...`) exactly as
  they are; never add one unless the tool cannot work without it.

## Farsi copy

- Never use zero-width characters in Farsi text anywhere (UI copy, docs, comments,
  strings): no ZWNJ (U+200C), ZWSP (U+200B), or ZWJ (U+200D), the invisible half space
  (نیم فاصله). Type a normal space: `می روم`, never the hidden-character version.
- End every Farsi sentence with `.` or `؟`; write `سند حذف شد.`, never `سند حذف شد`.
  In-progress text keeps its trailing `...`: `در حال بارگذاری...`,
  `در حال ساخت سند...`, `در حال حذف...`.
- Short labels carry no final punctuation: buttons (`افزودن سند`, `انصراف`, `بله`) and
  aria-labels/tooltips (`گزینه ها`, `تغییر پوسته`, `تلاش دوباره برای بارگذاری سند`).
- The untitled fallback is `عنوانی انتخاب نشده است.` (`documentTitleLabel` in
  `src/lib/documents.ts`); blank or whitespace titles save as `null`.

## shadcn/ui — `src/components/ui` is off-limits

- Never touch `src/components/ui`: no edits, refactors, fixes, moves, or anything else,
  ever. It is read-only vendored code.
- At the start of every session, read those components to learn what exists and how its
  props, structure, and exports work.

## App chrome and layout

- `src/components/app-shell.tsx` is only the frame: `flex h-screen flex-col bg-white p-6
dark:bg-zinc-900`, a `min-h-0 flex-1` `main`, the toaster, and close-save wiring. It
  must not render the title bar, save status, or back link.
- Every page renders its own `TitleBar` in normal flow at the top: `HomePage`,
  `DocumentPage`, `RouteError`, `RouteNotFound`. Home's `h1`/`DocumentCount` and the
  document's `DocumentBackLink` are `trailing`; `DocumentSaveStatus` is `center`.
- Keep the bar in flow: `relative flex w-full shrink-0 items-center justify-between`,
  `dir="rtl"`, no `h-16`. Never make it absolute/floating or add `ps-4`/`pe-4`; the
  shell's `p-6` is the only horizontal inset.
- The shell inset and page spacing are coupled: home root uses `gap-3`, the document
  wrapper uses `pt-6`, and route fallback content sits in a `flex-1` centered block with
  `p-6`. The title row and editor carry no horizontal padding of their own.
- The bar renders `trailing` first (right in RTL), then `center`, then the theme picker
  wrapper (`ms-auto`, left). Never put the picker before `trailing`. Home tab order:
  theme picker → add; with a failed count, heading retry → picker → add. Document tab
  order: back link → picker → title → toolbar/editor.
- Route fallbacks keep their `TitleBar`; the outer wrapper is `flex h-full min-h-0
flex-col` and the message block is `flex min-h-32 w-full flex-1 ... p-6`. Copy:
  «نمایش این صفحه ناموفق بود.» and «صفحه ی مورد نظر پیدا نشد.»; actions are neutral
  `outline` buttons.
- The document toolbar is full-bleed with `-mx-6 px-6`, never `w-full` (negative margins
  plus `width: 100%` leave the left edge short in RTL). Surface:
  `bg-gray-100 dark:bg-zinc-800`. `.document-body-editor .ProseMirror` uses
  `padding: 1.5rem 0`; do not restore horizontal padding. `-mx-6` is coupled to the
  shell's `p-6`.
- Toolbar hovers use `hover:bg-gray-200 dark:hover:bg-zinc-700`; the title uses
  `hover:bg-gray-100 dark:hover:bg-zinc-800`, with the same colors on focus.

## Visual system

- Neutral shadcn palette: `--primary` is `oklch(0.205 0 0)` light and
  `oklch(0.922 0 0)` dark; `--secondary`, `--muted`, `--accent`, and charts are
  grayscale. Do not reintroduce the old green primary
  (`oklch(0.508 0.118 165.612)` / `oklch(0.432 0.095 166.913)`). Only `--destructive`
  and the dark `--sidebar-primary` keep a hue; never use `--sidebar-primary` for
  selected/active states.
- `index.html` pre-mount background is `oklch(100% 0 0)` light and
  `oklch(21% 0.006 285.885)` dark; no green flash before React mounts.
- Code blocks use neutral surfaces: Shiki's dark background is `var(--color-zinc-800)`;
  the copy button is `bg-white text-zinc-900` with matching hover in light and
  `bg-zinc-900 text-white` in dark. The copied check icon inherits the button color;
  never `text-emerald-600` / `dark:text-emerald-400`.
- The multi-row selection toggle is pressed:
  `variant={isSelecting ? 'default' : 'outline'}` and `aria-pressed={isSelecting}`. The
  filled variant flips `ListChecks` to `primary-foreground`; no color class on the icon.

## Copy and status states

- Spinners, «در حال ...» text, and empty-state sentences (e.g. «هنوز سندی ثبت نشده
  است.») use the primary text color: no color class, so they inherit `text-foreground`;
  never `text-muted-foreground`. Use muted gray only for secondary text directly under
  its primary counterpart, like an `AlertDialogDescription` under its title.
- Failure sentences stay short: «بارگذاری سندها ناموفق بود.»,
  «بارگذاری سند ناموفق بود.», «بارگذاری تعداد سندها ناموفق بود.», and
  «نمایش این صفحه ناموفق بود.». The retry button carries the action; never append
  «دوباره تلاش کنید.».
- Failure text is `text-destructive`; retry is a neutral `outline` button whose
  `RefreshCw` has no color class. Count states stay on the title row: loading is a
  `role="status"` span with `size-4 animate-spin` and «در حال بارگذاری تعداد سندها...»;
  failure puts the destructive sentence and neutral retry inside the heading.
- Actionable toasts never use Sonner's inline `action` (a small label beside the
  message). Put a full-width `Button` in the `description`: `variant="outline"`,
  `size="sm"`, `className="mt-1 w-full text-foreground"`; dismiss the toast in the click
  handler before acting. Pin `w-full` with its label in a test.
- Every loading icon is `size-4` on the icon itself (`LoaderCircle`, spinning
  `RefreshCw`), even inside a `Button`; never `size-3`/`size-5`/`size-6`/`size-8` or
  `h-*`/`w-*` overrides. `animate-spin` marks loading; `animate-pulse` is only for
  stale content that keeps its data while re-reading (the table and count in
  `src/pages/home.tsx`). Spinner tests pin `size-4` with `animate-spin`.

## Numbers — format every visible number with `formatNumber`

- Every number the app renders as text goes through `formatNumber`
  (`src/lib/number.ts`): headings, table cells, pagination, buttons, menus, dialogs,
  toasts, tooltips, placeholders, status messages, and `aria-label`/`title`/`alt`. `3`,
  `12`, `3000` show as `۳`, `۱۲`, `۳٬۰۰۰`.
- Format where the copy is assembled, including inside sentences:
  `` `${formatNumber(count)} سند حذف شد.` ``. A raw `{count}`, `String(value)`, or
  template interpolation is a bug even below 1000.
- Default grouping is for counts and amounts. Pass `{ group: false }` for relative-time
  units (`۵ دقیقه ی پیش`) and other numeric identifiers; `formatRelativeTime`
  (`src/lib/date.ts`) is the shape to follow.
- Never hand-roll digits or grouping: no bare `toLocaleString()`, regex/digit
  replacement, `Intl.NumberFormat` at a call site, or manual `۰۱۲...` mapping.
  `formatNumber` pins `fa-IR`, so output is Persian digits with `٬` in every runtime.
- Dates and clock parts are the exception: `formatAbsoluteDate` uses
  `Intl.DateTimeFormat`, keeps Latin digits, and never groups, so a Persian year stays
  `1405`. Do not pass them through `formatNumber`.
- User-authored content is data: titles, bodies, and search terms render exactly as
  stored, even inside tab labels, checkbox labels, or delete-dialog titles. Never format
  or rewrite their digits. IDs used only in routes, query keys, or IPC are not visible
  text.
- Every new visible number needs a test pinning the rendered text.

## Editor toolbar and blocks

- Any toolbar action that changes the editor — button, dropdown item, or select option,
  including the already-active option — must leave focus in ProseMirror.
- Do not rely only on `chain().focus()` while an overlay is open: Radix restores focus on
  close and can undo it. Mark the selection, then focus from `onCloseAutoFocus`; follow
  `useEditorFocusAfterToolbarSelection` in `src/components/document-body-editor.tsx`.
- Closing a menu or select without choosing returns focus to its trigger, not the editor.
  Pin every case with `expect(await editorTextbox()).toHaveFocus()`, including the active
  option and keyboard selection.
- A toolbar action that inserts an HTML block must join the spacing system: add its
  selector to the `margin-top: 0` group in `src/components/document-body-editor.css`,
  keeping rhythm bottom-only.
- Check list items too: `li > * { margin-block: 0 }` flattens blocks, so a block that
  can appear in an item needs its own rule, like `li > ul`/`li > ol` getting
  `margin-block: 0.5em`.
- Set spacing explicitly when Typography's default is wrong (`hr` uses
  `margin-bottom: 1.5em`). If it is unclear, ask the user first and pin the selector in
  `tests/dom/document-body-editor.test.tsx`.

## Data, IPC, and autosave

- Document queries use `staleTime: Infinity` with no retries or focus/reconnect refetch
  (`src/lib/query.ts`). Every write must invalidate the queries it changed; a missed
  invalidation leaves the UI on old data.
- Schema changes are append-only: add a new SQL entry to `migrations` in
  `electron/database.ts`; never edit an applied migration. `PRAGMA user_version` tracks
  the version, and `tests/node/database.test.ts` pins migrations.
- List and count reads pass `{ requestId, payload }`; aborting the TanStack signal calls
  `documents.cancel(requestId)`, and main aborts that operation. Keep new long-running
  reads cancellable.
- `electron/main.ts` validates every IPC payload and returns `undefined`/`null` on
  invalid input; never trust renderer values. A new channel belongs in
  `electron/ipc.ts`, `electron/preload.ts`, `src/types/global.d.ts`, and a validating
  handler in `electron/main.ts`.
- Window security stays restricted: `setWindowOpenHandler` denies every new window and
  opens only `https:` URLs externally; `will-navigate` allows only the same app page.
  Never widen either handler.
- Autosave debounces 500ms and times out after 10s (`src/lib/document-save.ts`). Failed
  saves keep changes in memory (`src/lib/document-recovery.tsx`), show the error toast,
  and are restored on reopen and retried by the close handshake. Never drop pending
  changes.
- Keep the close handshake intact: main prevents close, sends `before-close`, the
  renderer flushes autosave and replies `close-ready` or `close-cancelled`, and main
  force-closes after `operationDelayMs + 5000`. In-flight saves also keep the window
  non-closable.

## Dev flags and seeded data

`bun dev` accepts three flags, passed to main as `DEV_SEED`, `DEV_DB_DELAY`, and
`DEV_DB_FAILURE`; they are rejected outside dev. Never run `bun dev` yourself.

- `--seed=<table>,<count>[-<table>,<count>]` resets the dev database and clears dev
  images and the journal before launch. Only `documents` has a seeding rule; add one
  before offering another table.
- `--db-delay=<milliseconds>ms` (e.g. `2000ms`) makes every query operation wait. Every
  query operation starts with `await waitBeforeQuery()`; skipping it escapes the flag. A
  slow read or write must show a loading/busy state (create spinner, document pending
  spinner, heading loader/pulse) — never blank out or silently wait. Pin it by holding
  the operation open, as the spinner tests in `tests/dom/routes.test.tsx` do.
- `--with-db-failure` prompts for operations to fail. Before covering a new query
  operation, ask the user. If yes, add its name to `databaseOperationNames` and call
  `failInjectedOperation('<name>')` right after `await waitBeforeQuery()`; an operation
  left out still awaits the delay. A failure must be visible and harmless (home: error
  toast for create, retry for count; document: failure message and retry).
- Update `tests/node/database.test.ts`, `tests/node/main.test.ts`, and
  `tests/node/db-failure-prompt.test.ts` in the same commit when the list changes.

## Images

- New image features use the app image store, never base64 or remote URLs. The editor
  sets `Image.configure({ allowBase64: false })`; inserted files go through
  `window.WordApp.images.save` and become
  `wordapp-image://image/<documentId>/<uuid>.<extension>`.
- Files live under `images/<documentId>/<uuid>.<extension>`, with the sibling
  `images-trash/<documentId>/` holding files the last save no longer references. Dev
  data uses `dev-data/images` and `dev-data/images-trash`; packaged data lives under
  `userData`. There is no journal file.
- `electron/images.ts` validates scheme, host, numeric document id, and UUID file name;
  the protocol handler serves only files from the document's own folder. Never widen
  that validation or serve arbitrary paths.
- `electron/image-store.ts` serializes operations. `save` writes a new file into the
  document folder, `copy` writes a fresh file so pasted images belong to the target
  document, and `collect` compares the saved and current bodies with the folder: it
  moves unreferenced files to trash and restores referenced files from trash. `sweep`
  runs once at startup, moves legacy flat files into their owner folder, trashes files
  no body references, restores referenced files, then empties the trash.
- Lifecycle: removing an image from the editor never touches the file, so undo needs no
  restore call. A successful body save collects unused files; deleting a document
  removes its image folder and trash folder. Keep these paths tested.

## React Compiler — keep renderer code compilable

`vite.config.ts` runs the compiler over `src/**` through `@rolldown/plugin-babel`, using
`reactCompiler = reactCompilerPreset()` from `@vitejs/plugin-react`. Memoization only
reaches compiled components, so keep the wiring intact and treat every skip as a bug.

- The gate is `bun run check:react-compiler`. It imports the same `reactCompiler`,
  transforms every renderer file, and exits non-zero on unexpected failures. Vitest does
  not run the compiler; `tests/node/react-compiler-check.test.ts` pins that every
  renderer file compiles and the app root and pages stay memoized.
- The compiler cannot compile `try`/`finally` and skips the whole function. Use promise
  `.finally()` for async cleanup, as in `addDocument` (`src/pages/home.tsx`) and
  `deleteDocument` (`src/components/document-options.tsx`). Never add a new
  `try`/`finally` in renderer code and never convert those two back.
- Never write `'use no memo'` or `'use no forget'`, and never silence
  `react-hooks/rules-of-hooks` or `react-hooks/exhaustive-deps` with
  `eslint-disable-next-line`; the compiler treats both as opt-outs and skips the
  function.
- `scripts/react-compiler-check.ts` currently has no accepted skips. Remove stale
  entries when a pinned skip stops matching; never add a new accepted skip without
  asking the user first.
- Keep `@babel/core` on 7.x (`package.json`): Babel 8 makes the compiler bail out on
  destructuring defaults and silently leave functions uncompiled.

## Tests

- Write tests for code you add or change in the same change; remove tests made redundant
  by removed code. Tests live in `tests/dom/` (renderer, happy-dom) and `tests/node/`
  (main/preload, Node).
- While working, run only the narrowest test that proves the change:
  `bun run test -- tests/dom/<file>.test.tsx -t "<test name>"`, or the matching
  `tests/node/<file>.test.ts`. Run the whole file only when you changed its shared
  helpers. The full suite is a pre-commit gate, not a development loop.
- Never start `bun run test:watch` (it never exits). `bun run test:coverage` is opt-in
  and only for the `coverage/` report.
- Do not test vendored `src/components/ui`; test the app's behavior around it.
- Pin layout structurally, not only by text: title bar child order, RTL tab sequence
  with `user.tab()`, page wrapper classes, and full-bleed toolbar classes.
- Existing structural pins: `App.test.tsx` (palette, app shell), `title-bar.test.tsx`
  (bar order), `index-html.test.ts` (pre-mount background), `routes.test.tsx` (copy, tab
  order, loading states, toolbar), `document-body-editor.test.tsx` (editor styles, code
  blocks), `documents-selection.test.tsx` (selection toggle).

## Pre-commit checks — only when the user is ready to stage

The five checks below are one expensive gate. Run it once, at the end of the request
batch, and never while a request is still open.

1. Finish every requested change and its tests. While working, run only the narrowest
   test that proves each change, as described under Tests.
2. When you believe nothing is left, ask whether any request remains and whether the
   user is ready to stage and commit. Never attach a release question to that message:
   the release decision is asked on its own, as described under Releases. Run the gate
   only after they answer yes to both. "No requests left" alone is not permission to
   run the checks.
3. After the user confirms, run the checks in order:
   - `bun run lint`
   - `bun run format` (Prettier)
   - `bun run test` (Vitest)
   - `bun run check:react-compiler`
   - `bun run build`
4. If a check fails, fix it and re-run all five from the start. Those re-runs stay
   inside the same gate.

Never run the gate after each edit, after each fix, or "just to be sure" in the middle
of a batch. If the user asks for one specific check earlier, run only that one.

## Releases — ask first

The release workflow (`.github/workflows/release.yml`) publishes the Windows installer
from a `v*` tag. The tag must be `v` plus the exact `version` in `package.json`; the
workflow fails before packaging when they differ, and the installer filename comes from
`package.json`, not the tag.

A release is three irreversible steps the user must approve by name: the version bump,
the tag, and the tag push. Until the release question below is answered explicitly, do
not edit `version` in `package.json`, create a tag, or push a tag.

- Every batch ends with the release question, in its own message, unless the user
  already answered it for that batch. A docs-only change still gets the question; never
  decide on the user's behalf that no release is needed.
- Ask it alone. Never fold it into a commit, push, merge, or staging question:
  "Want me to push `main`, and should this batch ship a release?" makes a bare "yes"
  ambiguous, and an ambiguous answer is not approval.
- Name the next semantic version (patch for a fix, minor for a feature, major for a
  breaking change) and the tag, e.g. "Should this batch ship `0.1.1` as tag `v0.1.1`?".
- Only an answer that directly approves that request counts. A bare "yes" to a message
  that also asked about pushing, committing, or merging approves only those things;
  re-ask the release question by itself. If any part of the answer is unclear, ask
  again instead of inferring a yes. Approval covers one release only: a request to
  commit, stage, push, or "continue" is never release approval.
- Only after that explicit yes: set `version` in `package.json`, include the bump in the
  batch commit, and run the gate once on the final tree that carries the bumped
  version. Never bump after the gate has already run.
- Before committing, read `git diff --cached` and confirm the only version change is
  the approved number. If the user approved only the commit, `package.json` keeps its
  current version and the commit must not touch it.
- At the final push, restate the version and tag in the update, then push `main`,
  create an annotated tag `v<version>` on that commit, and push the tag. Never move,
  delete, or reuse a tag whose release is already public; bump to a new version
  instead.
- Watch the workflow through success and verify the release contains
  `WordApp-Setup-<version>-x64.exe`, `latest.yml`, and the matching `.blockmap`.
- CI packages the installer. Do not run `bun run dist` or electron-builder locally.

## Commits

- Every commit has a short subject line, a blank line, then a body wrapped at 72
  characters. Never a one-line message, even for a small fix or docs update.
- Write in English. The body explains what changed, why, and how: behavior added or
  removed, edge cases, tests that pin it, and reasoning the diff cannot show. Describe
  only what landed; re-read the staged diff.
- For several concerns, open with one sentence and list them as `-` bullets.
- Write for someone reading `git log` a year from now: explain intent, not file names.
- Never run `git commit` without explicit permission, even when all checks pass.
