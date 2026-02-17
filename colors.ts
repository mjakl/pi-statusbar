export interface AnsiColors {
  getFgAnsi(r: number, g: number, b: number): string;
  getFgAnsi256(code: number): string;
  reset: string;
}

export const ansi: AnsiColors = {
  getFgAnsi: (r, g, b) => `\x1b[38;2;${r};${g};${b}m`,
  getFgAnsi256: (code) => `\x1b[38;5;${code}m`,
  reset: "\x1b[0m",
};

type NamedAnsiColor = "sep";

const NAMED_COLORS: Record<NamedAnsiColor, number> = {
  sep: 244,
};

export function getFgAnsiCode(color: NamedAnsiColor): string {
  const value = NAMED_COLORS[color];
  return ansi.getFgAnsi256(value);
}
