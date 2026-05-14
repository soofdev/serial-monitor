import { describe, expect, it } from "vitest";
import { ESP32_S3_DEVKITC_1 } from "./esp32-s3-devkitc-1";
import { BOARDS, findBoard } from "./index";

describe("ESP32-S3-DevKitC-1 layout", () => {
  const board = ESP32_S3_DEVKITC_1;

  it("has 44 total pins (22 per side)", () => {
    expect(board.pins).toHaveLength(44);
    expect(board.pins.filter((p) => p.side === "left")).toHaveLength(22);
    expect(board.pins.filter((p) => p.side === "right")).toHaveLength(22);
  });

  it("has unique (side, row) slots", () => {
    const seen = new Set<string>();
    for (const p of board.pins) {
      const key = `${p.side}:${p.row}`;
      expect(seen.has(key), `duplicate slot ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("rows go from 0 to rowsPerSide-1 contiguously on each side", () => {
    for (const side of ["left", "right"] as const) {
      const rows = board.pins
        .filter((p) => p.side === side)
        .map((p) => p.row)
        .sort((a, b) => a - b);
      expect(rows).toEqual(Array.from({ length: board.rowsPerSide }, (_, i) => i));
    }
  });

  it("marks the expected strapping pins", () => {
    const strapping = board.pins
      .filter((p) => p.capabilities?.includes("strapping"))
      .map((p) => p.gpio)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(strapping).toEqual([0, 3, 45, 46]);
  });

  it("marks USB pins on GPIO19 and GPIO20", () => {
    const usb = board.pins
      .filter((p) => p.capabilities?.includes("usb"))
      .map((p) => p.gpio)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(usb).toEqual([19, 20]);
  });

  it("marks UART0 on GPIO43 (TX) and GPIO44 (RX)", () => {
    const uart = board.pins
      .filter((p) => p.capabilities?.includes("uart"))
      .map((p) => p.gpio)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(uart).toEqual([43, 44]);
  });

  it("has unique GPIO numbers", () => {
    const gpios = board.pins.map((p) => p.gpio).filter((g): g is number => g !== null);
    expect(new Set(gpios).size).toBe(gpios.length);
  });
});

describe("board registry", () => {
  it("registers the ESP32-S3 board", () => {
    expect(BOARDS).toContain(ESP32_S3_DEVKITC_1);
  });

  it("findBoard returns by id", () => {
    expect(findBoard("esp32-s3-devkitc-1")).toBe(ESP32_S3_DEVKITC_1);
    expect(findBoard("nope")).toBeUndefined();
  });
});
