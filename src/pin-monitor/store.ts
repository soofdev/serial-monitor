import type { PinEvent, PinMode, PinValue } from "./protocol";

export interface PinInfo {
  pin: number;
  mode?: PinMode;
  value?: PinValue;
  lastUpdate: number;
}

export type PinChangeListener = (changedPins: ReadonlySet<number>) => void;

export interface PinStoreOptions {
  // Minimum gap between listener notifications, in ms. 0 = synchronous (useful for tests).
  flushIntervalMs?: number;
  // Injectable clock for deterministic tests.
  now?: () => number;
}

const DEFAULT_FLUSH_INTERVAL_MS = 33;

export class PinStore {
  private pins = new Map<number, PinInfo>();
  private listeners = new Set<PinChangeListener>();
  private dirty = new Set<number>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private board: string | null = null;
  private readonly flushIntervalMs: number;
  private readonly now: () => number;

  constructor(options: PinStoreOptions = {}) {
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.now = options.now ?? (() => Date.now());
  }

  apply(event: PinEvent): void {
    switch (event.kind) {
      case "hello":
        this.board = event.board;
        return;
      case "mode":
        for (const { pin, mode } of event.pins) {
          const existing = this.pins.get(pin);
          if (existing?.mode === mode) continue;
          this.pins.set(pin, {
            pin,
            mode,
            value: existing?.value,
            lastUpdate: this.now(),
          });
          this.dirty.add(pin);
        }
        break;
      case "state":
        for (const { pin, value } of event.pins) {
          const existing = this.pins.get(pin);
          if (existing && pinValueEquals(existing.value, value)) continue;
          this.pins.set(pin, {
            pin,
            mode: existing?.mode,
            value,
            lastUpdate: this.now(),
          });
          this.dirty.add(pin);
        }
        break;
    }
    if (this.dirty.size > 0) this.scheduleFlush();
  }

  get(pin: number): PinInfo | undefined {
    return this.pins.get(pin);
  }

  snapshot(): PinInfo[] {
    return Array.from(this.pins.values());
  }

  getBoard(): string | null {
    return this.board;
  }

  subscribe(listener: PinChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(): void {
    this.pins.clear();
    this.board = null;
    const hadDirty = this.dirty.size > 0;
    this.dirty.clear();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (hadDirty) {
      // Notify with empty set so listeners can re-render against snapshot().
      for (const l of this.listeners) l(new Set());
    }
  }

  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.dirty.size === 0) return;
    const changed = this.dirty;
    this.dirty = new Set();
    for (const l of this.listeners) l(changed);
  }

  private scheduleFlush(): void {
    if (this.flushIntervalMs === 0) {
      this.flush();
      return;
    }
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.flushIntervalMs);
  }
}

function pinValueEquals(a: PinValue | undefined, b: PinValue): boolean {
  if (!a) return false;
  if (a.type !== b.type) return false;
  if (a.type === "digital" && b.type === "digital") return a.level === b.level;
  if (a.type === "analog" && b.type === "analog") return a.raw === b.raw;
  if (a.type === "pwm" && b.type === "pwm") return a.duty === b.duty;
  return false;
}
