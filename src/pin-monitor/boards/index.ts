import type { BoardLayout } from "./types";
import { ESP32_S3_DEVKITC_1 } from "./esp32-s3-devkitc-1";

export const BOARDS: BoardLayout[] = [ESP32_S3_DEVKITC_1];

export const DEFAULT_BOARD = ESP32_S3_DEVKITC_1;

export function findBoard(id: string): BoardLayout | undefined {
  return BOARDS.find((b) => b.id === id);
}

export type { BoardLayout, PinDescriptor, PinSide, PinKind, PinCapability } from "./types";
