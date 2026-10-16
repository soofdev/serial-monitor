import type { BoardLayout } from "./types";
import { ESP32_S3_DEVKITC_1 } from "./esp32-s3-devkitc-1";
import { ESP32_DEVKITC_V4 } from "./esp32-devkitc-v4";
import { ESP32_DEVKIT_V1 } from "./esp32-devkit-v1";

export const BOARDS: BoardLayout[] = [
  ESP32_S3_DEVKITC_1,
  ESP32_DEVKITC_V4,
  ESP32_DEVKIT_V1,
];

export const DEFAULT_BOARD = ESP32_S3_DEVKITC_1;

export function findBoard(id: string): BoardLayout | undefined {
  return BOARDS.find((b) => b.id === id);
}

/** Match a $HELLO board id (or alias) against the registered boards. */
export function findBoardByAlias(alias: string): BoardLayout | undefined {
  const lower = alias.trim().toLowerCase();
  if (!lower) return undefined;
  return BOARDS.find(
    (b) => b.id.toLowerCase() === lower || b.aliases?.some((a) => a.toLowerCase() === lower)
  );
}

/** Pick a board for a detected chip family (e.g. "ESP32", "ESP32-S3"). */
export function findBoardByChip(chip: string): BoardLayout | undefined {
  const upper = chip.trim().toUpperCase();
  return BOARDS.find((b) => b.chips?.some((c) => c.toUpperCase() === upper));
}

/**
 * Guess a board from the OS port name. usbserial/ttyUSB ports are typically
 * USB-to-serial adapters (CP210x/CH340) wired to a classic ESP32; usbmodem/
 * ttyACM ports usually mean native USB-CDC (ESP32-S3, C3, etc.). Returns
 * undefined when nothing in the name is conclusive.
 */
export function guessBoardByPortName(portName: string): BoardLayout | undefined {
  const lower = portName.toLowerCase();
  if (lower.includes("usbserial") || lower.includes("ttyusb") || lower.includes("slab_usbtouart")) {
    return ESP32_DEVKITC_V4;
  }
  if (lower.includes("usbmodem") || lower.includes("ttyacm")) {
    return ESP32_S3_DEVKITC_1;
  }
  return undefined;
}

export type { BoardLayout, PinDescriptor, PinSide, PinKind, PinCapability } from "./types";
