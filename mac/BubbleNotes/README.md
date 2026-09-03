# Bubble Notes (macOS)

A native menu-bar app where sticky notes live tucked against the edge of your
screen. Each note is a small colored tab; hover it to preview the note, click
to pin it open, drag to reorder, and mark it complete to send it to the
archive.

## Features

- Notes stay docked as colored tabs along the screen edge (left or right,
  configurable) and stay out of the way of everything else on screen.
- Hover a tab to preview its note; click to keep it open; move the mouse away
  to let it slide back.
- Drag tabs up/down to reorder notes.
- Five note colors, a favorite star, and live autosave with a "Saved just
  now" indicator.
- Archive notes with "Mark complete"; restore, export, or permanently delete
  them from the Archive window (menu bar icon → Archive…).
- Export any note (or all notes) to Markdown files via "Export".
- Runs as a menu-bar-only app (no Dock icon).

## Requirements

- macOS 13 (Ventura) or later
- Xcode 15+ / Swift 5.9+ command-line tools

## Build & run

```bash
cd mac/BubbleNotes
swift run
```

This builds and launches the app directly (no Dock icon; look for the note
icon in the menu bar). Use `swift build -c release` for an optimized build.

### Making a double-clickable app

```bash
./Scripts/make_app_bundle.sh
open "dist/Bubble Notes.app"
```

This wraps the release binary in `dist/Bubble Notes.app`. Drag it into
`/Applications` to keep it around. (It isn't code-signed, so on first launch
you may need to right-click → Open, or allow it in
System Settings → Privacy & Security.)

### Opening in Xcode

Xcode can open the Swift package directly: `File → Open…` and pick
`mac/BubbleNotes/Package.swift`. From there you get full debugging, and can
use `Product → Archive` to build a distributable, signed app if you have
a Developer ID.

## How it's built

- SwiftUI for all UI, AppKit for the floating/borderless windows SwiftUI
  can't create on its own (`NSPanel` edge strip + per-note card windows).
- `NoteStore` persists notes as JSON in
  `~/Library/Application Support/BubbleNotes/notes.json`.
- `EdgeNotesController` owns the always-visible edge-tab strip window and
  creates/animates a small floating card window per note on hover/click.
- The status bar menu offers New Note, switching edges, and the Archive.
