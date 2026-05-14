export type PinMode =
  | "OUT"
  | "IN"
  | "IN_PULLUP"
  | "IN_PULLDOWN"
  | "AIN"
  | "AOUT"
  | string;

export type PinValue =
  | { type: "digital"; level: 0 | 1 }
  | { type: "analog"; raw: number }
  | { type: "pwm"; duty: number };

export type PinEvent =
  | { kind: "hello"; board: string }
  | { kind: "mode"; pins: PinModeAssignment[] }
  | { kind: "state"; pins: PinStateAssignment[] };

export interface PinModeAssignment {
  pin: number;
  mode: PinMode;
}

export interface PinStateAssignment {
  pin: number;
  value: PinValue;
}

const PROTOCOL_PREFIX = "$";

export function isProtocolLine(line: string): boolean {
  return line.trimStart().startsWith(PROTOCOL_PREFIX);
}

export function parseLine(line: string): PinEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(PROTOCOL_PREFIX)) return null;

  const [head, ...rest] = trimmed.split(/\s+/);
  switch (head) {
    case "$HELLO":
      return rest.length === 0 ? null : { kind: "hello", board: rest.join(" ") };
    case "$MODE":
      return parseMode(rest);
    case "$PIN":
      return parseState(rest);
    default:
      return null;
  }
}

function parseMode(tokens: string[]): PinEvent | null {
  const pins: PinModeAssignment[] = [];
  for (const tok of tokens) {
    const eq = tok.indexOf("=");
    if (eq <= 0) continue;
    const pin = parsePin(tok.slice(0, eq));
    const mode = tok.slice(eq + 1);
    if (pin === null || mode.length === 0) continue;
    pins.push({ pin, mode });
  }
  return pins.length === 0 ? null : { kind: "mode", pins };
}

function parseState(tokens: string[]): PinEvent | null {
  const pins: PinStateAssignment[] = [];
  for (const tok of tokens) {
    const eq = tok.indexOf("=");
    if (eq <= 0) continue;
    const pin = parsePin(tok.slice(0, eq));
    if (pin === null) continue;
    const value = parseValue(tok.slice(eq + 1));
    if (value === null) continue;
    pins.push({ pin, value });
  }
  return pins.length === 0 ? null : { kind: "state", pins };
}

function parsePin(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 255) return null;
  return n;
}

function parseValue(raw: string): PinValue | null {
  if (raw === "0") return { type: "digital", level: 0 };
  if (raw === "1") return { type: "digital", level: 1 };
  if (raw.startsWith("A:")) {
    const body = raw.slice(2);
    if (!/^\d+$/.test(body)) return null;
    return { type: "analog", raw: Number(body) };
  }
  if (raw.startsWith("P:")) {
    const body = raw.slice(2);
    if (!/^\d+$/.test(body)) return null;
    return { type: "pwm", duty: Number(body) };
  }
  return null;
}
