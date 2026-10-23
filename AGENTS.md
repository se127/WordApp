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

## App frame and title bar — pages own their chrome

- `src/components/app-shell.tsx` is only the frame: `flex h-screen flex-col bg-white
p-6 dark:bg-zinc-900`, a `min-h-0 flex-1` `main`, the toaster, and the close-save
  wiring. It must not render the title bar, the save status, or the document back link.
- Every page renders its own `TitleBar` in normal flow at the top: `HomePage`,
  `DocumentPage`, `RouteError`, and `RouteNotFound`. The home `h1`/`DocumentCount` and
  the document `DocumentBackLink` are `TitleBar` `trailing` content; the
  `DocumentSaveStatus` is `center`.
- Keep the bar in flow: `relative flex w-full shrink-0 items-center justify-between`,
  `dir="rtl"`, and no `h-16`. Do not make it absolute/floating or add `ps-4`/`pe-4`;
  the shell's `p-6` is the only horizontal inset.
- The shell inset and the page spacing are coupled: the home root uses `gap-3`; the
  document content wrapper uses `pt-6`; route fallback content sits in a `flex-1`
  centered block with `p-6`. The document title row and editor content carry no
  horizontal padding of their own.

## RTL tab order — DOM order is the tab order

- The title bar renders `trailing` first (the right side in RTL), then `center`, then
  the theme picker wrapper (`ms-auto`, the left side). Do not put the picker before the
  trailing slot.
- Home: with a count, Tab goes theme picker → add button. When the count read fails,
  the retry button inside the heading (the `trailing` slot) comes before the picker,
  then the add button.
- Document: Tab goes back link → theme picker → title heading → toolbar/editor.
- Pin the sequence with `user.tab()` in `tests/dom/routes.test.tsx` and pin the bar's
  child order in `tests/dom/App.test.tsx` and
  `tests/dom/components/title-bar.test.tsx`.

## Route fallback pages — keep the title bar

- `RouteError` and `RouteNotFound` render their own `TitleBar`; their outer wrapper is
  `flex h-full min-h-0 flex-col` and the message/action block is `flex min-h-32 w-full
flex-1 ... p-6` so the theme picker stays available outside the pages.
- Keep the copy short: «نمایش این صفحه ناموفق بود.» and «صفحه ی مورد نظر پیدا نشد.».
  The retry/back actions are neutral `outline` buttons (see the retry rule below).

## Document page — full-bleed toolbar

- The shell's `p-6` is the page inset. The document title row and editor content have
  no horizontal padding (`px-*`) of their own.
- The editor toolbar is full-bleed with `-mx-6 px-6` and must not use `w-full`:
  negative margins plus `width: 100%` leave the left edge short in RTL. Its surface is
  `bg-gray-100 dark:bg-zinc-800`.
- `.document-body-editor .ProseMirror` uses `padding: 1.5rem 0`; the toolbar's `px-6`
  and the shell's `p-6` provide the horizontal inset. Do not restore horizontal
  padding on the ProseMirror.
- The toolbar's `-mx-6` is coupled to the shell's `p-6`: changing one requires changing
  the other. Pin the classes in `tests/dom/document-body-editor.test.tsx` and
  `tests/dom/routes.test.tsx`.
- Editor toolbar hovers use `hover:bg-gray-200 dark:hover:bg-zinc-700`; the document
  title uses `hover:bg-gray-100` and `dark:hover:bg-zinc-800`, with the same colors on
  focus.

## Neutral surfaces — palette, code blocks, and selection toggle

- The app uses the neutral shadcn palette: `--primary` is `oklch(0.205 0 0)` in light
  and `oklch(0.922 0 0)` in dark; `--secondary`, `--muted`, `--accent`, and the charts
  are grayscale. Do not reintroduce the old green primary
  (`oklch(0.508 0.118 165.612)` / `oklch(0.432 0.095 166.913)`).
- `index.html` pre-mount background is `oklch(100% 0 0)` to match the light theme; the
  dark background stays `oklch(21% 0.006 285.885)`. There must be no green flash before
  React mounts.
- Code blocks use neutral surfaces: Shiki's dark background is fixed to
  `var(--color-zinc-800)`. The copy button is `bg-white text-zinc-900` with matching
  hover in light and `bg-zinc-900 text-white` in dark. The copied check icon inherits
  the button color — never emerald (`text-emerald-600` / `dark:text-emerald-400`).
- The multi-row selection toggle is a pressed toggle:
  `variant={isSelecting ? 'default' : 'outline'}` and
  `aria-pressed={isSelecting}`. The filled default variant flips the `ListChecks` icon
  to `primary-foreground`; do not put a color class on the icon or use
  `text-sidebar-primary`.
- Only `--destructive` and the dark `--sidebar-primary` keep a hue; do not use
  `--sidebar-primary` for selected/active UI states.
- Pin the palette, pre-mount background, code-block surfaces, and selection-toggle
  variant in `tests/dom/App.test.tsx`, `tests/node/index-html.test.ts`,
  `tests/dom/document-body-editor.test.tsx`, and
  `tests/dom/components/documents-selection.test.tsx`.

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

## Editor toolbar — new blocks need explicit spacing

- Any toolbar button or select that inserts a new HTML block must join the editor's
  spacing system: add its selector to the `margin-top: 0` group in
  `src/components/document-body-editor.css` so vertical rhythm stays bottom-only.
- Check the block inside list items as well. `li > * { margin-block: 0 }` flattens
  every block inside an item, so a block that can also appear in a list item needs
  its own rule, the way `li > ul` and `li > ol` get `margin-block: 0.5em`.
- When Typography's default bottom spacing is wrong for the document, set it
  explicitly — `hr` uses `margin-bottom: 1.5em` — rather than leaving the default.
- When the right spacing is not obvious from an existing element or the reference
  editor, ask the user before choosing, then pin the selector or rule in the
  stylesheet test in `tests/dom/document-body-editor.test.tsx`.

## React Compiler — keep renderer code compilable

`vite.config.ts` runs the React Compiler over `src/**` through
`@rolldown/plugin-babel`, using the `reactCompiler` preset it exports. Memoization only
reaches the components the compiler actually compiles, so keep that wiring intact and
treat every skip as a bug:

- The compiler check runs in the end-of-batch pre-commit (see below), not after every
  edit. It transforms every renderer file with the same preset as the build (it imports
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

## Failure and retry copy — short sentence, neutral retry

- Failure sentences stay short: «بارگذاری سندها ناموفق بود.»,
  «بارگذاری سند ناموفق بود.», «بارگذاری تعداد سندها ناموفق بود.», and
  «نمایش این صفحه ناموفق بود.». The retry button carries the action; do not append
  «دوباره تلاش کنید.» to the sentence.
- The sentence uses `text-destructive`; the retry button is a neutral `outline` button
  and its `RefreshCw` icon has no color class (no `text-destructive`). This is the
  pattern for the count, list, document, and route-error retries.
- The heading's count states stay on the title row: loading is a `role="status"` span
  with a `size-4 animate-spin` loader and «در حال بارگذاری تعداد سندها...»; failure
  places the destructive sentence and the neutral retry inside the heading.
- Pin the copy and classes in `tests/dom/routes.test.tsx`.

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

- Always write tests for the code you add or change as part of the same change. When
  you remove code, check whether its tests are now redundant and remove them too.
- Tests live in `tests/`, split by runtime: `tests/dom/` for renderer code (`src/**`,
  runs under happy-dom) and `tests/node/` for main/preload code (`electron/**`, runs
  under plain Node). Run them with `bun run test`; use `bun run test:watch` while
  developing.
- Coverage is opt-in: `bun run test:coverage` prints a per-file table and writes an
  HTML report to `coverage/`.
- Do not write tests for the vendored shadcn components in `src/components/ui` — they
  are installed code, not ours. Test the app's own behavior around them.
- Pin layout changes structurally, not only by visible text: the title bar's child
  order, the RTL tab sequence with `user.tab()`, the page wrapper classes, and the
  full-bleed toolbar classes.

## Pre-commit checks — once per request batch

Do not run the full pre-commit sequence after every edit. Implement all the changes
the user asked for (with their tests) first, then ask whether any request is left to
implement. If the user says no, run all five checks in this order and fix whatever
they report:

1. Lint: `bun run lint` — fix all reported problems.
2. Format: `bun run format` (Prettier) — fix all reported problems.
3. Tests: `bun run test` (Vitest) — all tests must pass.
4. React Compiler: `bun run check:react-compiler` — every renderer file must compile;
   fix what it reports, and never pin a new accepted skip without asking.
5. Build: `bun run build` — must finish successfully.

If any check fails, fix the problem, then re-run all five from the start and repeat
until everything passes. Only then tell the user the work is ready to stage. Never
commit without explicit permission (see below).

The checks are still mandatory before a commit; they run once per request batch, after
the user confirms nothing is left, instead of after every small edit. If the user asks
for a specific check earlier, run that check then.

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
