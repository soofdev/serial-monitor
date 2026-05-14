import { describe, expect, it } from "vitest";
import { isProtocolLine, parseLine } from "./protocol";

describe("isProtocolLine", () => {
  it("recognizes lines starting with $", () => {
    expect(isProtocolLine("$PIN 5=1")).toBe(true);
    expect(isProtocolLine("  $PIN 5=1")).toBe(true);
  });

  it("rejects normal log lines", () => {
    expect(isProtocolLine("hello world")).toBe(false);
    expect(isProtocolLine("price: $5")).toBe(false);
    expect(isProtocolLine("")).toBe(false);
  });
});

describe("parseLine — $HELLO", () => {
  it("parses board name", () => {
    expect(parseLine("$HELLO esp32-s3")).toEqual({
      kind: "hello",
      board: "esp32-s3",
    });
  });

  it("joins multi-word board strings", () => {
    expect(parseLine("$HELLO esp32-s3 v1.0")).toEqual({
      kind: "hello",
      board: "esp32-s3 v1.0",
    });
  });

  it("returns null when board name missing", () => {
    expect(parseLine("$HELLO")).toBeNull();
  });
});

describe("parseLine — $MODE", () => {
  it("parses a single pin", () => {
    expect(parseLine("$MODE 5=OUT")).toEqual({
      kind: "mode",
      pins: [{ pin: 5, mode: "OUT" }],
    });
  });

  it("parses multiple pins", () => {
    expect(parseLine("$MODE 5=OUT 18=IN_PULLUP 21=AIN")).toEqual({
      kind: "mode",
      pins: [
        { pin: 5, mode: "OUT" },
        { pin: 18, mode: "IN_PULLUP" },
        { pin: 21, mode: "AIN" },
      ],
    });
  });

  it("skips malformed tokens but keeps valid ones", () => {
    expect(parseLine("$MODE 5=OUT garbage 18=IN =OUT 99=")).toEqual({
      kind: "mode",
      pins: [
        { pin: 5, mode: "OUT" },
        { pin: 18, mode: "IN" },
      ],
    });
  });

  it("returns null when no valid pins remain", () => {
    expect(parseLine("$MODE garbage =bad")).toBeNull();
    expect(parseLine("$MODE")).toBeNull();
  });

  it("tolerates unknown mode strings", () => {
    expect(parseLine("$MODE 5=WEIRD_MODE")).toEqual({
      kind: "mode",
      pins: [{ pin: 5, mode: "WEIRD_MODE" }],
    });
  });
});

describe("parseLine — $PIN", () => {
  it("parses digital values", () => {
    expect(parseLine("$PIN 5=1 18=0")).toEqual({
      kind: "state",
      pins: [
        { pin: 5, value: { type: "digital", level: 1 } },
        { pin: 18, value: { type: "digital", level: 0 } },
      ],
    });
  });

  it("parses analog values", () => {
    expect(parseLine("$PIN 21=A:2048")).toEqual({
      kind: "state",
      pins: [{ pin: 21, value: { type: "analog", raw: 2048 } }],
    });
  });

  it("parses PWM values", () => {
    expect(parseLine("$PIN 4=P:128")).toEqual({
      kind: "state",
      pins: [{ pin: 4, value: { type: "pwm", duty: 128 } }],
    });
  });

  it("parses mixed digital/analog/PWM in one line", () => {
    expect(parseLine("$PIN 5=1 21=A:1024 4=P:64")).toEqual({
      kind: "state",
      pins: [
        { pin: 5, value: { type: "digital", level: 1 } },
        { pin: 21, value: { type: "analog", raw: 1024 } },
        { pin: 4, value: { type: "pwm", duty: 64 } },
      ],
    });
  });

  it("accepts pin 0", () => {
    expect(parseLine("$PIN 0=1")).toEqual({
      kind: "state",
      pins: [{ pin: 0, value: { type: "digital", level: 1 } }],
    });
  });

  it("rejects negative pin numbers", () => {
    expect(parseLine("$PIN -1=1")).toBeNull();
  });

  it("rejects non-numeric pin numbers", () => {
    expect(parseLine("$PIN abc=1")).toBeNull();
  });

  it("rejects malformed values", () => {
    expect(parseLine("$PIN 5=2")).toBeNull();
    expect(parseLine("$PIN 5=X")).toBeNull();
    expect(parseLine("$PIN 5=A:")).toBeNull();
    expect(parseLine("$PIN 5=A:foo")).toBeNull();
  });

  it("keeps valid tokens when others are malformed", () => {
    expect(parseLine("$PIN 5=1 bogus 18=A:512")).toEqual({
      kind: "state",
      pins: [
        { pin: 5, value: { type: "digital", level: 1 } },
        { pin: 18, value: { type: "analog", raw: 512 } },
      ],
    });
  });
});

describe("parseLine — non-protocol input", () => {
  it("returns null for plain log lines", () => {
    expect(parseLine("Hello from setup()")).toBeNull();
    expect(parseLine("price: $5")).toBeNull();
    expect(parseLine("")).toBeNull();
    expect(parseLine("   ")).toBeNull();
  });

  it("returns null for unknown directives", () => {
    expect(parseLine("$UNKNOWN 5=1")).toBeNull();
  });

  it("handles leading/trailing whitespace", () => {
    expect(parseLine("  $PIN 5=1  ")).toEqual({
      kind: "state",
      pins: [{ pin: 5, value: { type: "digital", level: 1 } }],
    });
  });
});
