export type PinSide = "left" | "right";

export type PinCapability =
  | "digital"
  | "adc"
  | "touch"
  | "dac"
  | "strapping"
  | "usb"
  | "uart"
  | "boot"
  | "led"
  | "flash"
  | "input_only";

export type PinKind = "gpio" | "power" | "ground" | "reset";

export interface PinDescriptor {
  // GPIO number, or null for power/ground/reset pins.
  gpio: number | null;
  kind: PinKind;
  // Short label shown next to the pin pad ("GPIO5", "GND", "3V3", "RST").
  label: string;
  // Secondary labels (alt functions like "TX0", "USB D+", "BOOT").
  alt?: string[];
  side: PinSide;
  // Row index from top (0 = closest to USB).
  row: number;
  capabilities?: PinCapability[];
}

export interface BoardLayout {
  id: string;
  name: string;
  // Other strings the firmware/chip may report that should match this board.
  // First entry should be the canonical id.
  aliases?: string[];
  // Chip family names (as returned by detect_chip / espflash) this board belongs to.
  chips?: string[];
  usbSide: "top" | "bottom";
  rowsPerSide: number;
  pins: PinDescriptor[];
}
