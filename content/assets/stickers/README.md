---
title: "Sticker Assets README"
date: "2026-06-29"
type: "asset-note"
tags: ["assets", "stickers"]
status: "reference"
publish: false
privacy: "private"
summary: "Where public-safe GIF sticker assets for the sticker wall are stored."
---

# Sticker Assets

Public GIF stickers for `content/Sticker Wall.md` live here.

Recommended layout:

```text
content/assets/stickers/<sticker-pack-name>/*.gif
```

Each first-level folder becomes one sticker category on `content/Sticker Categories.md`
and one filter button on `content/Sticker Wall.md`.

Run `npm.cmd run generate-sticker-wall`, `npm.cmd run preview`, or `npm.cmd run build` after adding files. The sticker wall page will refresh its asset list automatically.

Only place assets here when they are safe to publish on the public site.
