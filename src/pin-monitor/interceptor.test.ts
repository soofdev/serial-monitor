import { describe, expect, it } from "vitest";
import { PinInterceptor } from "./interceptor";
import { PinStore } from "./store";

function setup() {
  const store = new PinStore({ flushIntervalMs: 0, now: () => 0 });
  const interceptor = new PinInterceptor(store);
  return { store, interceptor };
}

describe("PinInterceptor", () => {
  it("passes plain log lines through unchanged", () => {
    const { interceptor } = setup();
    const out = interceptor.process("hello\nworld\n");
    expect(out).toBe("hello\nworld\n");
  });

  it("strips protocol lines from terminal output by default", () => {
    const { interceptor, store } = setup();
    const out = interceptor.process("before\n$PIN 5=1\nafter\n");
    expect(out).toBe("before\nafter\n");
    expect(store.get(5)?.value).toEqual({ type: "digital", level: 1 });
  });

  it("keeps protocol lines when showProtocol is true", () => {
    const { interceptor, store } = setup();
    interceptor.showProtocol = true;
    const out = interceptor.process("$PIN 5=1\n");
    expect(out).toBe("$PIN 5=1\n");
    expect(store.get(5)?.value).toEqual({ type: "digital", level: 1 });
  });

  it("preserves \\r\\n line endings on log lines", () => {
    const { interceptor } = setup();
    const out = interceptor.process("hello\r\n");
    expect(out).toBe("hello\r\n");
  });

  it("handles \\r\\n on protocol lines (strips for parsing)", () => {
    const { interceptor, store } = setup();
    const out = interceptor.process("$PIN 5=1\r\nafter\n");
    expect(out).toBe("after\n");
    expect(store.get(5)?.value).toEqual({ type: "digital", level: 1 });
  });

  it("buffers partial lines across chunks", () => {
    const { interceptor, store } = setup();
    expect(interceptor.process("$PIN 5=")).toBe("");
    expect(interceptor.process("1\n")).toBe("");
    expect(store.get(5)?.value).toEqual({ type: "digital", level: 1 });
  });

  it("buffers partial non-protocol lines and emits when complete", () => {
    const { interceptor } = setup();
    expect(interceptor.process("hel")).toBe("");
    expect(interceptor.process("lo\n")).toBe("hello\n");
  });

  it("handles multiple lines in a single chunk", () => {
    const { interceptor, store } = setup();
    const out = interceptor.process("a\n$PIN 5=1\nb\n$PIN 18=0\nc\n");
    expect(out).toBe("a\nb\nc\n");
    expect(store.get(5)?.value).toEqual({ type: "digital", level: 1 });
    expect(store.get(18)?.value).toEqual({ type: "digital", level: 0 });
  });

  it("malformed protocol lines fall through to terminal", () => {
    const { interceptor, store } = setup();
    const out = interceptor.process("$UNKNOWN abc\n");
    expect(out).toBe("$UNKNOWN abc\n");
    expect(store.snapshot()).toEqual([]);
  });

  it("reset() drops buffered partial", () => {
    const { interceptor } = setup();
    interceptor.process("partial");
    interceptor.reset();
    expect(interceptor.process("\n")).toBe("\n");
  });
});
