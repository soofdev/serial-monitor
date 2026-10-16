import { describe, expect, it } from "vitest";
import { ESP32_S3_DEVKITC_1 } from "./esp32-s3-devkitc-1";
import { ESP32_DEVKITC_V4 } from "./esp32-devkitc-v4";
import { ESP32_DEVKIT_V1 } from "./esp32-devkit-v1";
import {
  BOARDS,
  findBoard,
  findBoardByAlias,
  findBoardByChip,
  guessBoardByPortName,
} from "./index";

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
  it("registers all boards", () => {
    expect(BOARDS).toContain(ESP32_S3_DEVKITC_1);
    expect(BOARDS).toContain(ESP32_DEVKITC_V4);
    expect(BOARDS).toContain(ESP32_DEVKIT_V1);
  });

  it("findBoard returns by id", () => {
    expect(findBoard("esp32-s3-devkitc-1")).toBe(ESP32_S3_DEVKITC_1);
    expect(findBoard("esp32-devkitc-v4")).toBe(ESP32_DEVKITC_V4);
    expect(findBoard("esp32-devkit-v1")).toBe(ESP32_DEVKIT_V1);
    expect(findBoard("nope")).toBeUndefined();
  });

  it("findBoardByAlias matches id and aliases", () => {
    expect(findBoardByAlias("ESP32-S3")).toBe(ESP32_S3_DEVKITC_1);
    expect(findBoardByAlias("esp32-dev")).toBe(ESP32_DEVKITC_V4);
    expect(findBoardByAlias("garbage")).toBeUndefined();
  });

  it("findBoardByChip maps chip family to board", () => {
    expect(findBoardByChip("ESP32")).toBe(ESP32_DEVKITC_V4);
    expect(findBoardByChip("ESP32-S3")).toBe(ESP32_S3_DEVKITC_1);
    expect(findBoardByChip("ESP32-H2")).toBeUndefined();
  });

  it("guessBoardByPortName picks ESP32 for USB-serial bridges", () => {
    expect(guessBoardByPortName("/dev/cu.usbserial-0001")).toBe(ESP32_DEVKITC_V4);
    expect(guessBoardByPortName("/dev/ttyUSB0")).toBe(ESP32_DEVKITC_V4);
  });

  it("guessBoardByPortName picks S3 for native USB-CDC", () => {
    expect(guessBoardByPortName("/dev/cu.usbmodem5AE60211621")).toBe(ESP32_S3_DEVKITC_1);
    expect(guessBoardByPortName("/dev/ttyACM0")).toBe(ESP32_S3_DEVKITC_1);
  });

  it("guessBoardByPortName returns undefined for ambiguous names", () => {
    expect(guessBoardByPortName("COM3")).toBeUndefined();
  });
});

describe("ESP32-DevKitC-V4 layout", () => {
  const board = ESP32_DEVKITC_V4;

  it("has 38 total pins (19 per side)", () => {
    expect(board.pins).toHaveLength(38);
    expect(board.pins.filter((p) => p.side === "left")).toHaveLength(19);
    expect(board.pins.filter((p) => p.side === "right")).toHaveLength(19);
  });

  it("marks GPIO 6–11 as flash pins", () => {
    const flash = board.pins
      .filter((p) => p.capabilities?.includes("flash"))
      .map((p) => p.gpio)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(flash).toEqual([6, 7, 8, 9, 10, 11]);
  });

  it("marks input-only pins (GPIO 34, 35, 36, 39)", () => {
    const inputOnly = board.pins
      .filter((p) => p.capabilities?.includes("input_only"))
      .map((p) => p.gpio)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(inputOnly).toEqual([34, 35, 36, 39]);
  });

  it("marks DAC pins (GPIO 25, 26)", () => {
    const dac = board.pins
      .filter((p) => p.capabilities?.includes("dac"))
      .map((p) => p.gpio)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(dac).toEqual([25, 26]);
  });

  it("marks the expected strapping pins (0, 2, 5, 12, 15)", () => {
    const strapping = board.pins
      .filter((p) => p.capabilities?.includes("strapping"))
      .map((p) => p.gpio)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(strapping).toEqual([0, 2, 5, 12, 15]);
  });
});

describe("ESP32 DevKit V1 (30-pin) layout", () => {
  const board = ESP32_DEVKIT_V1;

  it("has 30 total pins (15 per side)", () => {
    expect(board.pins).toHaveLength(30);
    expect(board.pins.filter((p) => p.side === "left")).toHaveLength(15);
    expect(board.pins.filter((p) => p.side === "right")).toHaveLength(15);
  });

  it("does NOT expose flash pins (GPIO 6–11)", () => {
    const flashGpios = [6, 7, 8, 9, 10, 11];
    for (const g of flashGpios) {
      expect(board.pins.find((p) => p.gpio === g)).toBeUndefined();
    }
  });

  it("does NOT expose GPIO0", () => {
    expect(board.pins.find((p) => p.gpio === 0)).toBeUndefined();
  });

  it("has unique slots", () => {
    const seen = new Set<string>();
    for (const p of board.pins) {
      const key = `${p.side}:${p.row}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
