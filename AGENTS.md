# AGENTS.md

This project is a reproducible Quartz v5 workflow for an academic and personal knowledge garden.

## Project boundaries

- Read the project structure and the relevant source files before changing code or content.
- Prefer small, reviewable changes. Explain the content, biological, statistical, or technical reason before changing analysis logic.
- Do not delete, rename, or overwrite important files without explicit approval.
- Keep private material under ignored paths such as `content/private/`, `content/drafts/`, `_local/`, or `.env.local`.
- Never place credentials or raw private records in publishable Markdown.

## Content workflow

- Editable public pages live under `content/` and require both `publish: true` and `privacy: public`.
- The `Article Title` component renders the page `<h1>` from frontmatter. Start normal page bodies at paragraph or `<h2>` level; do not repeat the title as a Markdown H1.
- The protected daily-log source is `content/Our Calendar/每日记录编辑本.md`.
- `content/Our Calendar/index.md` is generated output; do not hand-edit it unless the generator itself is being debugged.
- Save public figures under `content/assets/figures/` and generated analysis tables under an appropriate `outputs/` directory. Do not overwrite raw data.
- Use clear Chinese explanations and retain necessary English terms, variable names, and function names.

## Code conventions

- Add useful comments to scripts, including Java code, especially around inputs, outputs, assumptions, and non-obvious logic.
- Avoid hard-coded absolute paths. Resolve paths from the repository root or the current script file.
- For research code, make random seeds, units, coordinate systems, missing-value handling, input files, output files, and figure saving explicit.
- Preserve UTF-8 encoding for Chinese content.

## Local commands on Windows

- Preview: `npm.cmd run preview`
- Daily-log editor: `npm.cmd run daily-gui`
- Privacy and type checks: `npm.cmd run check`
- Tests: `npm.cmd test`
- Full build: `npm.cmd run build`

The ignored `.env.local` file supplies `PARENT_CALENDAR_PASSWORD` and the separate `CALENDAR_ACCESS_TOKEN`. Do not print, reuse, or commit their values. Deploy Worker authentication changes before the static site that depends on them.

## Verification before handoff

1. Run `npm.cmd run check`.
2. Run `npm.cmd test` when code or configuration changes.
3. Run `npm.cmd run build` for page, generator, styling, or deployment-related changes.
4. Run `npm.cmd run check:site` to verify core routes, headings, local links, and search-index exclusions.
5. Check the affected routes in a local browser at desktop and mobile widths.
6. Summarize what changed, why, how to run it, and how the user can verify the result.
