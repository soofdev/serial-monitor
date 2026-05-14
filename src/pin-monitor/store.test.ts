import { describe, expect, it, vi } from "vitest";
import { PinStore } from "./store";
import type { PinEvent } from "./protocol";

function mkStore() {
  let t = 1_000;
  return new PinStore({ flushIntervalMs: 0, now: () => ++t });
}

describe("PinStore — apply $MODE", () => {
  it("records pin mode", () => {
    const store = mkStore();
    store.apply({ kind: "mode", pins: [{ pin: 5, mode: "OUT" }] });
    expect(store.get(5)?.mode).toBe("OUT");
  });

  it("preserves existing value when mode changes", () => {
    const store = mkStore();
    store.apply({ kind: "state", pins: [{ pin: 5, value: { type: "digital", level: 1 } }] });
    store.apply({ kind: "mode", pins: [{ pin: 5, mode: "OUT" }] });
    expect(store.get(5)?.value).toEqual({ type: "digital", level: 1 });
    expect(store.get(5)?.mode).toBe("OUT");
  });
});

describe("PinStore — apply $PIN", () => {
  it("records digital state", () => {
    const store = mkStore();
    store.apply({ kind: "state", pins: [{ pin: 5, value: { type: "digital", level: 1 } }] });
    expect(store.get(5)?.value).toEqual({ type: "digital", level: 1 });
  });

  it("updates lastUpdate on change", () => {
    const store = mkStore();
    store.apply({ kind: "state", pins: [{ pin: 5, value: { type: "digital", level: 0 } }] });
    const t1 = store.get(5)!.lastUpdate;
    store.apply({ kind: "state", pins: [{ pin: 5, value: { type: "digital", level: 1 } }] });
    const t2 = store.get(5)!.lastUpdate;
    expect(t2).toBeGreaterThan(t1);
  });

  it("does not bump lastUpdate when value is unchanged", () => {
    const store = mkStore();
    store.apply({ kind: "state", pins: [{ pin: 5, value: { type: "digital", level: 1 } }] });
    const t1 = store.get(5)!.lastUpdate;
    store.apply({ kind: "state", pins: [{ pin: 5, value: { type: "digital", level: 1 } }] });
    expect(store.get(5)!.lastUpdate).toBe(t1);
  });
});

describe("PinStore — $HELLO", () => {
  it("records board name", () => {
    const store = mkStore();
    store.apply({ kind: "hello", board: "esp32-s3" });
    expect(store.getBoard()).toBe("esp32-s3");
  });
});

describe("PinStore — subscribers (synchronous mode)", () => {
  it("notifies on changes with the dirty pin set", () => {
    const store = mkStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.apply({
      kind: "state",
      pins: [
        { pin: 5, value: { type: "digital", level: 1 } },
        { pin: 18, value: { type: "digital", level: 0 } },
      ],
    });

    expect(listener).toHaveBeenCalledTimes(1);
    const changed = listener.mock.calls[0][0] as Set<number>;
    expect(Array.from(changed).sort((a, b) => a - b)).toEqual([5, 18]);
  });

  it("does not notify when nothing changed", () => {
    const store = mkStore();
    store.apply({ kind: "state", pins: [{ pin: 5, value: { type: "digital", level: 1 } }] });
    const listener = vi.fn();
    store.subscribe(listener);
    store.apply({ kind: "state", pins: [{ pin: 5, value: { type: "digital", level: 1 } }] });
    expect(listener).not.toHaveBeenCalled();
  });

  it("unsubscribe stops notifications", () => {
    const store = mkStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.apply({ kind: "state", pins: [{ pin: 5, value: { type: "digital", level: 1 } }] });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("PinStore — throttled flush", () => {
  it("coalesces rapid updates into a single notification", () => {
    vi.useFakeTimers();
    try {
      const store = new PinStore({ flushIntervalMs: 33, now: () => 0 });
      const listener = vi.fn();
      store.subscribe(listener);

      for (let level: 0 | 1 = 0, i = 0; i < 10; i++, level = level === 0 ? 1 : 0) {
        store.apply({ kind: "state", pins: [{ pin: 5, value: { type: "digital", level } }] });
      }

      expect(listener).not.toHaveBeenCalled();
      vi.advanceTimersByTime(33);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(Array.from(listener.mock.calls[0][0] as Set<number>)).toEqual([5]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("flush() forces immediate notification", () => {
    const store = new PinStore({ flushIntervalMs: 33, now: () => 0 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.apply({ kind: "state", pins: [{ pin: 5, value: { type: "digital", level: 1 } }] });
    store.flush();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("PinStore — reset", () => {
  it("clears all state", () => {
    const store = mkStore();
    store.apply({ kind: "hello", board: "esp32-s3" });
    store.apply({ kind: "state", pins: [{ pin: 5, value: { type: "digital", level: 1 } }] });
    store.reset();
    expect(store.getBoard()).toBeNull();
    expect(store.snapshot()).toEqual([]);
  });
});

describe("PinStore — snapshot", () => {
  it("returns all known pins", () => {
    const store = mkStore();
    const events: PinEvent[] = [
      { kind: "mode", pins: [{ pin: 5, mode: "OUT" }, { pin: 18, mode: "IN" }] },
      { kind: "state", pins: [{ pin: 5, value: { type: "digital", level: 1 } }] },
    ];
    for (const e of events) store.apply(e);
    const snap = store.snapshot().sort((a, b) => a.pin - b.pin);
    expect(snap.map((p) => p.pin)).toEqual([5, 18]);
    expect(snap[0].mode).toBe("OUT");
    expect(snap[0].value).toEqual({ type: "digital", level: 1 });
  });
});
