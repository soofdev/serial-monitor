import type { BoardLayout, PinDescriptor } from "./types";

// ESP32-S3-DevKitC-1 (44-pin module variant, e.g. N8R2 / N16R8).
// Orientation: USB-C connector at top edge; rows numbered from top.
// Reference: Espressif ESP32-S3-DevKitC-1 v1.1 schematic.
//
// Strapping pins: GPIO0 (BOOT), GPIO3, GPIO45, GPIO46.
// USB-JTAG / USB-Serial: GPIO19 (D-), GPIO20 (D+).
// Default UART0: TX=GPIO43, RX=GPIO44.
// On-board RGB LED is wired to GPIO48 on N8R8/N16R8 variants (absent on N8R2).

const left: PinDescriptor[] = [
  { gpio: null, kind: "ground", label: "GND", side: "left", row: 0 },
  { gpio: null, kind: "power", label: "3V3", side: "left", row: 1 },
  { gpio: null, kind: "power", label: "3V3", side: "left", row: 2 },
  { gpio: null, kind: "reset", label: "RST", side: "left", row: 3 },
  { gpio: 4, kind: "gpio", label: "GPIO4", side: "left", row: 4, capabilities: ["digital", "adc", "touch"] },
  { gpio: 5, kind: "gpio", label: "GPIO5", side: "left", row: 5, capabilities: ["digital", "adc", "touch"] },
  { gpio: 6, kind: "gpio", label: "GPIO6", side: "left", row: 6, capabilities: ["digital", "adc", "touch"] },
  { gpio: 7, kind: "gpio", label: "GPIO7", side: "left", row: 7, capabilities: ["digital", "adc", "touch"] },
  { gpio: 15, kind: "gpio", label: "GPIO15", side: "left", row: 8, capabilities: ["digital", "adc"] },
  { gpio: 16, kind: "gpio", label: "GPIO16", side: "left", row: 9, capabilities: ["digital", "adc"] },
  { gpio: 17, kind: "gpio", label: "GPIO17", side: "left", row: 10, capabilities: ["digital", "adc"] },
  { gpio: 18, kind: "gpio", label: "GPIO18", side: "left", row: 11, capabilities: ["digital", "adc"] },
  { gpio: 8, kind: "gpio", label: "GPIO8", side: "left", row: 12, capabilities: ["digital", "adc", "touch"] },
  { gpio: 3, kind: "gpio", label: "GPIO3", side: "left", row: 13, capabilities: ["digital", "adc", "touch", "strapping"] },
  { gpio: 46, kind: "gpio", label: "GPIO46", side: "left", row: 14, capabilities: ["digital", "strapping"] },
  { gpio: 9, kind: "gpio", label: "GPIO9", side: "left", row: 15, capabilities: ["digital", "adc", "touch"] },
  { gpio: 10, kind: "gpio", label: "GPIO10", side: "left", row: 16, capabilities: ["digital", "adc", "touch"] },
  { gpio: 11, kind: "gpio", label: "GPIO11", side: "left", row: 17, capabilities: ["digital", "adc", "touch"] },
  { gpio: 12, kind: "gpio", label: "GPIO12", side: "left", row: 18, capabilities: ["digital", "adc", "touch"] },
  { gpio: 13, kind: "gpio", label: "GPIO13", side: "left", row: 19, capabilities: ["digital", "adc", "touch"] },
  { gpio: 14, kind: "gpio", label: "GPIO14", side: "left", row: 20, capabilities: ["digital", "adc", "touch"] },
  { gpio: null, kind: "power", label: "5V", side: "left", row: 21 },
];

const right: PinDescriptor[] = [
  { gpio: null, kind: "ground", label: "GND", side: "right", row: 0 },
  { gpio: 43, kind: "gpio", label: "GPIO43", alt: ["TX0"], side: "right", row: 1, capabilities: ["digital", "uart"] },
  { gpio: 44, kind: "gpio", label: "GPIO44", alt: ["RX0"], side: "right", row: 2, capabilities: ["digital", "uart"] },
  { gpio: 1, kind: "gpio", label: "GPIO1", side: "right", row: 3, capabilities: ["digital", "adc", "touch"] },
  { gpio: 2, kind: "gpio", label: "GPIO2", side: "right", row: 4, capabilities: ["digital", "adc", "touch"] },
  { gpio: 42, kind: "gpio", label: "GPIO42", side: "right", row: 5, capabilities: ["digital"] },
  { gpio: 41, kind: "gpio", label: "GPIO41", side: "right", row: 6, capabilities: ["digital"] },
  { gpio: 40, kind: "gpio", label: "GPIO40", side: "right", row: 7, capabilities: ["digital"] },
  { gpio: 39, kind: "gpio", label: "GPIO39", side: "right", row: 8, capabilities: ["digital"] },
  { gpio: 38, kind: "gpio", label: "GPIO38", side: "right", row: 9, capabilities: ["digital"] },
  { gpio: 37, kind: "gpio", label: "GPIO37", side: "right", row: 10, capabilities: ["digital"] },
  { gpio: 36, kind: "gpio", label: "GPIO36", side: "right", row: 11, capabilities: ["digital"] },
  { gpio: 35, kind: "gpio", label: "GPIO35", side: "right", row: 12, capabilities: ["digital"] },
  { gpio: 0, kind: "gpio", label: "GPIO0", alt: ["BOOT"], side: "right", row: 13, capabilities: ["digital", "strapping", "boot"] },
  { gpio: 45, kind: "gpio", label: "GPIO45", side: "right", row: 14, capabilities: ["digital", "strapping"] },
  { gpio: 48, kind: "gpio", label: "GPIO48", alt: ["RGB LED"], side: "right", row: 15, capabilities: ["digital", "led"] },
  { gpio: 47, kind: "gpio", label: "GPIO47", side: "right", row: 16, capabilities: ["digital"] },
  { gpio: 21, kind: "gpio", label: "GPIO21", side: "right", row: 17, capabilities: ["digital"] },
  { gpio: 20, kind: "gpio", label: "GPIO20", alt: ["USB D+"], side: "right", row: 18, capabilities: ["digital", "adc", "usb"] },
  { gpio: 19, kind: "gpio", label: "GPIO19", alt: ["USB D-"], side: "right", row: 19, capabilities: ["digital", "adc", "usb"] },
  { gpio: null, kind: "ground", label: "GND", side: "right", row: 20 },
  { gpio: null, kind: "ground", label: "GND", side: "right", row: 21 },
];

export const ESP32_S3_DEVKITC_1: BoardLayout = {
  id: "esp32-s3-devkitc-1",
  name: "ESP32-S3-DevKitC-1",
  aliases: ["esp32-s3-devkitc-1", "esp32-s3-devkitc", "esp32-s3", "esp32s3"],
  chips: ["ESP32-S3"],
  usbSide: "top",
  rowsPerSide: 22,
  pins: [...left, ...right],
};
