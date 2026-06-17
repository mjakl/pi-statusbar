# pi-statusbar

**Powerline-style status bar for Pi, with presets, semantic colors, and adaptive icons.**

## User Guide

### Why pi-statusbar

`pi-statusbar` keeps the most useful session context visible without adding another panel or workflow:

- active model and thinking level
- current path and git state
- token, cost, cache, and context-window usage
- elapsed time, wall clock time, session id, hostname, and extension status strings
- compact presets for different terminal widths

It is intentionally focused on the status bar only.

### Features

- **Automatic status bar** — enabled when the extension loads.
- **Preset switching** — choose from built-in layouts with `/powerline <preset>`.
- **Persistent config** — selected preset and color overrides are saved under Pi's agent config directory.
- **Semantic colors** — use Pi theme color names or direct hex colors.
- **Adaptive icons** — richer Nerd Font icons when available, readable fallbacks otherwise.
- **Data-driven visibility** — segments hide when their data is unavailable or zero.
- **Extension status support** — status strings from other extensions can be shown in the bar.

### Install

Install directly from git:

```bash
pi install git:github.com/mjakl/pi-statusbar
```

Or install from a local checkout:

```bash
pi install /path/to/pi-statusbar
```

Restart Pi after installing or updating the extension.

Package name: `@mjakl/pi-statusbar`.

### Using pi-statusbar

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

When you switch presets, the selected preset is saved automatically.

### Configuration

User configuration is stored in:

```text
~/.pi/agent/extensions/pi-statusbar.json
```

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

Supported top-level keys:

- `preset` — one of the built-in preset names.
- `theme` — semantic color overrides keyed by segment/color role.

Supported theme override values:

- Pi theme color names: `accent`, `primary`, `muted`, `dim`, `text`, `success`, `warning`, `error`, `borderMuted`
- Hex colors: `#rrggbb`

### Nerd Font detection

Icons adapt automatically based on terminal font support.

- Nerd Font terminals get richer icons.
- Fallback mode uses simpler Unicode/ASCII-friendly symbols.

You can force either mode:

```bash
POWERLINE_NERD_FONTS=1 pi   # force Nerd Font icons
POWERLINE_NERD_FONTS=0 pi   # force fallback icons
```

---

## Technical Reference

These sections are for advanced customization and maintainers.

### Customizing layout presets

The JSON config selects a preset and color overrides. Layout structure is defined in TypeScript preset objects.

To customize layout in an installed checkout, edit:

```text
~/.pi/agent/extensions/pi-statusbar/presets.ts
```

Then restart Pi.

Recommended workflow:

1. Pick the closest preset (`focused`, `default`, `compact`, `minimal`, etc.).
2. Edit that preset in `presets.ts`.
3. Run `/powerline <preset-name>` to use it.

Preset fields:

- `leftSegments` — segment order on the top row, left to right.
- `rightSegments` — additional top-row segments appended after left segments.
- `secondarySegments` — overflow row shown below the editor when space allows.
- `separator` — separator style between segments.
- `segmentOptions` — per-segment behavior such as path mode, git counters, and time format.
- `colors` — semantic color palette used by that preset.

Because presets are plain TypeScript objects, they are straightforward to adjust and version-control.

### Segment reference

| Segment ID | Meaning | Icon(s) used |
|---|---|---|
| `pi` | Pi marker segment | `pi` icon (`` / `π`) |
| `model` | Active model name, with `model_key` in parentheses when available (`provider/model-id`, e.g. `openai-codex/gpt-5.3-codex`) using a muted tone of the model color; optionally includes inline thinking tag | `model` icon (`` / `◈`) |
| `model_key` | Raw model key only (`provider/model-id`, e.g. `anthropic/claude-sonnet-4-20250514`), without the human-readable name; optionally includes inline thinking tag | `model` icon (`` / `◈`) |
| `model_name` | Human-readable model name only, without the raw key suffix; optionally includes inline thinking tag | `model` icon (`` / `◈`) |
| `thinking` | Current thinking level (`think:off/min/low/med/high/xhigh`) | no icon; text only |
| `path` | Current working directory, shown as basename, abbreviated path, or full path depending on preset | `folder` icon (`` / `📁`) |
| `git` | Branch and file-state counters (`*` unstaged, `+` staged, `?` untracked) | `branch` icon (`` / `⎇`), or `git` icon (`` / `⎇`) when branch text is hidden |
| `token_in` | Total input tokens in session | `input` icon (`` / `in:`) |
| `token_out` | Total output tokens in session | `output` icon (`` / `out:`) |
| `token_total` | Combined token count, including input, output, cache read, and cache write | `tokens` icon (`` / `⊛`) |
| `cost` | Session cost or `(sub)` for subscription usage | no icon; text only |
| `context_pct` | Context usage percentage and window (`xx.x%/N`), plus auto-compact marker when enabled. Right after compaction this may briefly show `?/N` until Pi has a fresh context estimate. | Dynamic battery icon: `<20%` `󰂄` / `⚡`, `20-80%` `󱊢` / `◫`, `>80%` `󰂃` / `!`, plus auto icon (`󰁨` / `⚡`) |
| `context_total` | Model context window size only | `context` icon (`` / `◫`) |
| `time_spent` | Elapsed session time (`1m20s`, `2h5m`) | `time` icon (`` / `◷`) |
| `time` | Current local time, 24h or 12h, optional seconds | `time` icon (`` / `◷`) |
| `session` | Short session id, first 8 characters | `session` icon (`` / `id`) |
| `hostname` | Machine hostname | `host` icon (`` / `host`) |
| `cache_read` | Cache-read token count | `cache` + `input` icons (` ` / `cache in:`) |
| `cache_write` | Cache-write token count | `cache` + `output` icons (` ` / `cache out:`) |
| `extension_statuses` | Status strings reported by other loaded extensions, recolored to the muted separator tone | no fixed icon |

Notes:

- Thinking labels shown inside `model`, when enabled by a preset, use dedicated labels/icons per level.
- Segment visibility is data-driven. For example, token, cost, and cache segments hide when their value is zero.

### Local development

This package ships TypeScript files directly because Pi loads extension entry points from the package manifest.

```bash
npm install
pi -e .
```

## License

MIT
