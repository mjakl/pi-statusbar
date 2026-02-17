# pi-statusbar

A focused [pi](https://github.com/badlogic/pi-mono) extension for configuring a powerline-style status bar.

## Fork notice

This repository is a fork of:

- https://github.com/nicobailon/pi-powerline-footer

This fork intentionally keeps only the powerline status bar functionality and removes other features (welcome/splash UI, vibe/working-message replacement, and related extras).

I prefer small, focused packages, which is why this fork exists.

**All credit goes to the original author, Nico Bailon, for the original project and implementation.**

## Scope of this fork

This version is intentionally minimal:
- no splash / welcome overlay
- no working-message replacement (`/vibe` removed)
- no non-status-bar UI features

## Installation (via git)

Install directly from this fork:

```bash
pi install git:github.com/mjakl/pi-statusbar
```

After installation, restart pi to activate the extension.

## Usage

The status bar is enabled automatically.

```text
/powerline            # toggle on/off
/powerline <preset>   # switch preset
```

Available presets:
- `default`
- `focused`
- `minimal`
- `compact`
- `full`
- `nerd`
- `ascii`

## Persistent config file

This extension stores user config in:

- `~/.pi/agent/extensions/pi-statusbar.json`

Current structure:

```json
{
  "preset": "focused",
  "theme": {
    "pi": "accent",
    "model": "#d787af",
    "path": "#00afaf",
    "gitClean": "success",
    "gitDirty": "warning"
  }
}
```

Notes:
- When you run `/powerline <preset>`, the `preset` value is updated in this file automatically.
- `theme` is a semantic color override map.

## Configure your own status line (by editing presets)

The JSON config selects a preset and theme, but layout structure (segment order/content) is intentionally defined in TypeScript presets.

To customize layout, edit:

- `~/.pi/agent/extensions/pi-statusbar/presets.ts`

Then restart pi.

Recommended workflow:
1. Pick the closest preset (`focused`, `default`, `compact`, `minimal`, etc.)
2. Edit that preset in `presets.ts`
3. Run `/powerline <preset-name>` to use it

What to edit in each preset:
- `leftSegments`: segment order on the top row (left-to-right)
- `rightSegments`: additional top-row segments appended after left segments
- `secondarySegments`: overflow row shown below the editor when space allows
- `separator`: separator style between segments
- `segmentOptions`: per-segment behavior (path mode, git counters, time format, etc.)
- `colors`: semantic color palette used by that preset

Because presets are plain TypeScript objects, they are straightforward to adjust and version-control.

## Segments and icons

Icons adapt automatically based on Nerd Font support.

- Nerd Font terminals get richer icons.
- Fallback mode uses simpler Unicode/ASCII-friendly symbols.
- You can force behavior with `POWERLINE_NERD_FONTS=1` (on) or `POWERLINE_NERD_FONTS=0` (off).

| Segment ID | Meaning | Icon(s) used |
|---|---|---|
| `pi` | Pi marker segment | `pi` icon (`` / `π`) |
| `model` | Active model name, with `model_key` in parentheses when available (`provider/model-id`, e.g. `openai-codex/gpt-5.3-codex`) using a muted tone of the model color (optionally includes inline thinking tag) | `model` icon (`` / `◈`) |
| `thinking` | Current thinking level (`think:off/min/low/med/high/xhigh`) | no icon (text-only) |
| `path` | Current working directory (basename/abbreviated/full by preset) | `folder` icon (`` / `📁`) |
| `git` | Branch and file-state counters (`*` unstaged, `+` staged, `?` untracked) | `branch` icon (`` / `⎇`), and `git` icon (`` / `⎇`) when branch text is hidden |
| `token_in` | Total input tokens in session | `input` icon (`` / `in:`) |
| `token_out` | Total output tokens in session | `output` icon (`` / `out:`) |
| `token_total` | Combined token count (input + output + cache read/write) | `tokens` icon (`` / `⊛`) |
| `cost` | Session cost or `(sub)` for subscription usage | no icon (text-only) |
| `context_pct` | Context usage percentage + window (`xx.x%/N`), plus auto-compact marker when enabled | `context` icon (`` / `◫`) + `auto` icon (`󰁨` / `⚡`) |
| `context_total` | Model context window size only | `context` icon (`` / `◫`) |
| `time_spent` | Elapsed session time (`1m20s`, `2h5m`) | `time` icon (`` / `◷`) |
| `time` | Current local time (`24h` or `12h`, optional seconds) | `time` icon (`` / `◷`) |
| `session` | Short session id (first 8 chars) | `session` icon (`` / `id`) |
| `hostname` | Machine hostname | `host` icon (`` / `host`) |
| `cache_read` | Cache-read token count | `cache` + `input` icons (` ` / `cache in:`) |
| `cache_write` | Cache-write token count | `cache` + `output` icons (` ` / `cache out:`) |
| `extension_statuses` | Status strings reported by other loaded extensions | no fixed icon (passes extension text through) |

Notes:
- Thinking labels shown inside `model` (when enabled by preset) use dedicated labels/icons per level.
- Segment visibility is data-driven (e.g. token/cost/cache segments hide when value is zero).

## Theme overrides

Theme overrides are read from:

- `~/.pi/agent/extensions/pi-statusbar.json`

inside the `theme` object.

Example:

```json
{
  "preset": "focused",
  "theme": {
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
