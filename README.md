# pi-powerline-footer

A focused [pi](https://github.com/badlogic/pi-mono) extension for configuring a powerline-style status bar.

## Fork notice

This repository is a fork of:

- https://github.com/nicobailon/pi-powerline-footer.git

This fork intentionally keeps only the powerline status bar functionality and removes other features (welcome/splash UI, vibe/working-message replacement, and related extras).

I prefer small, focused packages, which is why this fork exists.

**All credit goes to the original author, Nico Bailon, for the original project and implementation.**

## Scope of this fork

This version is intentionally minimal:
- no splash / welcome overlay
- no working-message replacement (`/vibe` removed)
- no non-status-bar UI features

## Installation

```bash
pi install npm:pi-powerline-footer
```

Restart pi to activate.

## Usage

The status bar is enabled automatically.

```text
/powerline            # toggle on/off
/powerline <preset>   # switch preset
```

Available presets:
- `default`
- `minimal`
- `compact`
- `full`
- `nerd`
- `ascii`
- `custom`

## What the status bar shows

Depending on preset, segments can include:
- model
- thinking level
- path
- git branch + file state
- token usage / cache usage
- cost / subscription indicator
- context usage
- time / elapsed time
- session / hostname
- extension statuses

## Theme overrides

You can override segment colors with:

`~/.pi/agent/extensions/powerline-footer/theme.json`

Example:

```json
{
  "colors": {
    "pi": "accent",
    "model": "#d787af",
    "path": "#00afaf",
    "gitClean": "success",
    "gitDirty": "warning"
  }
}
```

Supported values:
- pi theme color names (`accent`, `primary`, `muted`, `dim`, `text`, `success`, `warning`, `error`, `borderMuted`)
- hex colors (`#rrggbb`)

See `theme.example.json` for a fuller example.
