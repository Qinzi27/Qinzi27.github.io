# Qinzi27 Academic Garden

A Quartz v5 Markdown-based academic blog for long-term learning notes, paper reading, projects, and selected life writing.

## Structure

- `content/index.md`: Home
- `content/About.md`: About
- `content/Now.md`: Current focus
- `content/Learning Notes/`: bioinformatics, statistics, coding, PhD preparation
- `content/Research & Papers/`: paper reading and research synthesis
- `content/Life Journal/`: selected weekly reviews, fitness, travel, reading, thoughts, growth
- `content/Projects/`: project logs and PhD preparation
- `templates/`: reusable Markdown templates
- `content/assets/`: public-safe images and decorative assets
- `content/private/assets/`: private or unlicensed reference assets, ignored and unpublished
- `scripts/prepublish-check.mjs`: privacy-safe pre-publish scanner
- `plugins/privacy-publish-filter/`: Quartz filter that publishes only public notes

## Frontmatter

Every publishable Markdown note should include:

```yaml
---
title: "Note title"
date: "2026-06-27"
type: "learning-note"
tags: ["bioinformatics", "statistics"]
status: "seed"
publish: true
privacy: "public"
summary: "One-sentence summary."
---
```

The site publishes normal public Markdown notes where both of these are true:

```yaml
publish: true
privacy: public
```

It can also publish encrypted pages for private sharing:

```yaml
publish: true
privacy: protected
passwordEnv: PARENT_CALENDAR_PASSWORD
unlisted: true
```

Do not write a real `password:` value into Markdown. Set the matching environment variable locally, and add the same name as a GitHub Actions repository secret before deploying.

## Privacy Rules

The build excludes folders named:

- `private/`
- `drafts/`
- `raw/`
- `emails/`
- `attachments/`
- `pdfs/`

The pre-publish check also fails the build if publishable content contains sensitive keywords such as passport, visa, address, phone, email, ID number, token, API key, secret, or password. Protected pages must use `passwordEnv`; literal `password:` frontmatter is blocked so the site password is not committed by accident.

The check prints the file and line that triggered the warning. It never deletes files automatically.

## Assets

Use these locations:

- Public-safe assets: `content/assets/`
- Decorative public assets: `content/assets/decor/`
- Covers and section banners: `content/assets/covers/`
- Private or unlicensed reference assets: `content/private/assets/`

Only put images in `content/assets/` when you made them, they are openly licensed, or you have permission to publish them. Character wallpapers from the web should stay in `content/private/assets/` unless you have publishing rights.

Reference a public image in Markdown like this:

```md
![[assets/decor/example.webp]]
```

The `content/private/` folder is ignored by Git and excluded from publishing, so it is the right place for local-only inspiration packs, draft screenshots, and unlicensed reference images.

## Write A New Note

1. Copy a template from `templates/`.
2. Place the new note under the right folder in `content/`.
3. Keep `publish: false` and `privacy: private` while drafting.
4. Change to `publish: true` and `privacy: public` only when the note is safe to publish.
5. Link related notes with Quartz wiki links, for example `[[Learning Notes]]`.

## Preview Locally

Install dependencies once:

```bash
npm ci
```

Preview the site:

```bash
npm run preview
```

This runs the privacy check, installs Quartz plugins from `quartz.config.yaml`, and starts a local Quartz preview server.

For protected pages, set the password environment variable first:

```powershell
$env:PARENT_CALENDAR_PASSWORD = "your-password-here"
npm run preview
```

## Couple Calendar Stickers

Edit daily calendar content here:

```text
content/Our Calendar/每日记录编辑本.md
```

Or use the local pixel-style editor:

```powershell
npm.cmd run daily-gui
```

Then open the printed local URL in a browser. The GUI appends or merges entries into `content/Our Calendar/每日记录编辑本.md`, saves a private backup under `content/private/backups/daily-log/`, and can refresh `content/Our Calendar/index.md` after each save.

Use these pages:

- `/`: write a new quick record.
- `/calendar.html`: inspect previous days, search old short notes, and edit one calendar day at a time.

The same GUI also includes a one-click Git push panel. It shows the current changed files, lets you edit a commit message, then runs the calendar sync, project check, `git add --all`, `git commit`, and `git push`.

Then run:

```powershell
npm.cmd run generate-calendar
```

This updates the protected calendar page with a clickable calendar and a daily-content section.

Put public-safe sticker images here:

```text
content/assets/couple-calendar-stickers/
```

Supported formats: PNG, JPG, WebP, GIF, SVG, and AVIF.

The build runs `npm run generate-calendar`, scans that folder, and updates the sticker area on the protected calendar page.

## Shared Visitor Interactions

Shared stickers and per-day calendar comments are stored by a Cloudflare Worker with D1:

```text
workers/interactions/
```

Useful commands:

```powershell
npm.cmd run interactions:migrate
npm.cmd run interactions:deploy
```

The public site reads the Worker URL from `PUBLIC_INTERACTIONS_API_URL` at build time. If the URL is empty or the Worker is unavailable, sticker placement and comments fall back to local browser storage.

For GitHub Pages deployment, set repository variable `PUBLIC_INTERACTIONS_API_URL` to the deployed Worker URL, for example `https://qinzi27-interactions.<your-subdomain>.workers.dev`.

The Worker secret `ADMIN_TOKEN` is for moderation endpoints only. Do not commit it. A local copy can be kept under `content/private/`.

## Build

```bash
npm run build
```

The build writes the generated static site to `public/`.

## Commit And Publish

```bash
npm run prepublish-check
git status
git add .
git commit -m "Update academic garden"
git push origin main
```

GitHub Actions deploys the Quartz site to GitHub Pages after the privacy check and build pass.

In the GitHub repository settings, Pages should use **GitHub Actions** as the source.
