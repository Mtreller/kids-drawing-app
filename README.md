# Color Pop Kids Drawing App

A responsive React, TypeScript, and Vite drawing and coloring app designed for phones, tablets, touchscreens, Apple Pencil, trackpads, and mouse/keyboard use.

## Features

- Pressure-aware brush, eraser, opacity, and brush-size controls
- Tap-to-fill and Procreate-style drag-to-fill with adjustable tolerance
- Mouse, touch, multi-touch, Apple Pencil, trackpad, and keyboard input
- Pinch/Ctrl-wheel zoom, two-finger/trackpad pan, middle-button or Space-drag pan
- One-finger object movement and two-finger object resize/rotation
- Two-finger tap undo and three-finger tap redo
- Shapes, stickers, uploads, PNG export, and a built-in drawing library
- Focus mode, left-handed layout, haptic feedback, and smart control hiding
- Automatic local restoration, installable PWA metadata, and offline caching

## Keyboard controls

- `B`, `E`, `F`, `V`: brush, eraser, fill, and move tools
- `[` / `]`: decrease/increase brush size
- `Ctrl/Cmd + Z`: undo; add `Shift` to redo
- `Ctrl/Cmd + S`: save PNG
- `Space + drag` or middle-button drag: pan
- `0`: fit canvas; `H`: focus mode; `L`: left-handed layout

## Development

```sh
npm install
npm run dev
npm run build
```

The production build uses the GitHub Pages base path `/kids-drawing-app/` and deploys from `.github/workflows/deploy.yml`.
