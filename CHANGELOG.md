# Changelog

## 0.3.1

### Changed
- Refactored extension internals for better structure and maintainability.
- Split responsibilities into dedicated modules:
  - `layout.ts` (responsive status layout + cache)
  - `segment-context.ts` (session metrics/context assembly)
  - `status-bar-ui.ts` (editor/footer/widget UI wiring)
  - `runtime-types.ts` (runtime-safe extension/context typings)
- Replaced `any` usage with explicit local types.
- Reduced duplication in git-branch rerender handling and UI setup/teardown.
- Simplified ANSI color utilities to only what is needed for current scope.

## 0.3.0

### Changed
- Slimmed extension down to status-bar functionality only.
- Removed welcome/splash UI.
- Removed working-message vibe replacement and `/vibe` command.
- Removed related settings/configuration paths for removed features.
- Kept `/powerline` command for status-bar toggle and preset selection.

### Notes
This is a focused release for users who only want status-bar customization.
