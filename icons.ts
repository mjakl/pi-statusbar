export interface IconSet {
  pi: string;
  model: string;
  folder: string;
  branch: string;
  git: string;
  tokens: string;
  context: string;
  contextLow: string;
  contextMedium: string;
  contextHigh: string;
  time: string;
  cache: string;
  input: string;
  output: string;
  host: string;
  session: string;
  auto: string;
}

// Separator characters
export const SEP_DOT = " · ";

// Thinking level display text (Unicode/ASCII)
export const THINKING_TEXT_UNICODE: Record<string, string> = {
  minimal: "[min]",
  low: "[low]",
  medium: "[med]",
  high: "[high]",
  xhigh: "[xhi]",
  max: "[max]",
};

// Thinking level display text (Nerd Fonts - with icons)
export const THINKING_TEXT_NERD: Record<string, string> = {
  minimal: "\u{F0E7} min",   // lightning bolt
  low: "\u{F10C} low",       // circle outline
  medium: "\u{F192} med",    // dot circle
  high: "\u{F111} high",     // circle
  xhigh: "\u{F06D} xhi",     // fire
  max: "\u{F071} max",       // warning triangle
};

// Get thinking text based on font support
export function getThinkingText(level: string): string | undefined {
  if (hasNerdFonts()) {
    return THINKING_TEXT_NERD[level];
  }
  return THINKING_TEXT_UNICODE[level];
}

// Nerd Font icons (matching oh-my-pi exactly)
export const NERD_ICONS: IconSet = {
  pi: "\uE22C",         // nf-oct-pi (stylized pi icon)
  model: "\uEC19",      // nf-md-chip (model/AI chip)
  folder: "\uF115",     // nf-fa-folder_open
  branch: "\uF126",     // nf-fa-code_fork (git branch)
  git: "\uF1D3",        // nf-fa-git (git logo)
  tokens: "\uE26B",     // nf-seti-html (tokens symbol)
  context: "\uE70F",    // nf-dev-database (context total)
  contextLow: "\u{F0084}",    // nf-md-battery_charging (<20%)
  contextMedium: "\u{F12A2}", // nf-md-battery_medium (20-80%)
  contextHigh: "\u{F0083}",   // nf-md-battery_alert (>80%)
  time: "\uF017",       // nf-fa-clock_o
  cache: "\uF1C0",      // nf-fa-database (cache)
  input: "\uF090",      // nf-fa-sign_in (input arrow)
  output: "\uF08B",     // nf-fa-sign_out (output arrow)
  host: "\uF109",       // nf-fa-laptop (host)
  session: "\uF550",    // nf-md-identifier (session id)
  auto: "\u{F0068}",    // nf-md-lightning_bolt (auto-compact)
};

// ASCII/Unicode fallback icons (matching oh-my-pi)
export const ASCII_ICONS: IconSet = {
  pi: "π",
  model: "◈",
  folder: "📁",
  branch: "⎇",
  git: "⎇",
  tokens: "⊛",
  context: "◫",
  contextLow: "⚡",
  contextMedium: "◫",
  contextHigh: "!",
  time: "◷",
  cache: "cache",
  input: "in:",
  output: "out:",
  host: "host",
  session: "id",
  auto: "⚡",
};

// Separator characters
export interface SeparatorChars {
  powerlineLeft: string;
  powerlineRight: string;
  powerlineThinLeft: string;
  powerlineThinRight: string;
  slash: string;
  pipe: string;
  block: string;
  space: string;
  asciiLeft: string;
  asciiRight: string;
  dot: string;
}

export const NERD_SEPARATORS: SeparatorChars = {
  powerlineLeft: "\uE0B0",    // 
  powerlineRight: "\uE0B2",   // 
  powerlineThinLeft: "\uE0B1", // 
  powerlineThinRight: "\uE0B3", // 
  slash: "/",
  pipe: "|",
  block: "█",
  space: " ",
  asciiLeft: ">",
  asciiRight: "<",
  dot: "·",
};

export const ASCII_SEPARATORS: SeparatorChars = {
  powerlineLeft: ">",
  powerlineRight: "<",
  powerlineThinLeft: "|",
  powerlineThinRight: "|",
  slash: "/",
  pipe: "|",
  block: "#",
  space: " ",
  asciiLeft: ">",
  asciiRight: "<",
  dot: ".",
};

// Detect Nerd Font support (check TERM or specific env var)
export function hasNerdFonts(): boolean {
  // User can set this env var to force Nerd Fonts
  if (process.env.POWERLINE_NERD_FONTS === "1") return true;
  if (process.env.POWERLINE_NERD_FONTS === "0") return false;
  
  // Check for Ghostty (survives into tmux via GHOSTTY_RESOURCES_DIR)
  if (process.env.GHOSTTY_RESOURCES_DIR) return true;
  
  // Check common terminals known to support Nerd Fonts (case-insensitive)
  const term = (process.env.TERM_PROGRAM || "").toLowerCase();
  const nerdTerms = ["iterm", "wezterm", "kitty", "ghostty", "alacritty"];
  return nerdTerms.some(t => term.includes(t));
}

export function getIcons(): IconSet {
  return hasNerdFonts() ? NERD_ICONS : ASCII_ICONS;
}

export function getSeparatorChars(): SeparatorChars {
  return hasNerdFonts() ? NERD_SEPARATORS : ASCII_SEPARATORS;
}
