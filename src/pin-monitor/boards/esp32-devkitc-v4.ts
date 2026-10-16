import type { BoardLayout, PinDescriptor } from "./types";

// ESP32-DevKitC-V4 (38-pin variant).
// Rendered with USB at the top to match the S3 layout. On the physical
// board the microUSB sits at the bottom; users can rotate mentally.
//
// Strapping pins: GPIO 0, 2, 5, 12, 15.
// Internal flash (do not use!): GPIO 6, 7, 8, 9, 10, 11.
// Input-only: GPIO 34, 35, 36, 39.
// UART0: TX = GPIO1, RX = GPIO3.
// DAC: GPIO25 (DAC1), GPIO26 (DAC2).

const right: PinDescriptor[] = [
  { gpio: null, kind: "power", label: "3V3", side: "right", row: 0 },
  { gpio: null, kind: "reset", label: "EN", side: "right", row: 1 },
  { gpio: 36, kind: "gpio", label: "GPIO36", alt: ["VP"], side: "right", row: 2, capabilities: ["digital", "adc", "input_only"] },
  { gpio: 39, kind: "gpio", label: "GPIO39", alt: ["VN"], side: "right", row: 3, capabilities: ["digital", "adc", "input_only"] },
  { gpio: 34, kind: "gpio", label: "GPIO34", side: "right", row: 4, capabilities: ["digital", "adc", "input_only"] },
  { gpio: 35, kind: "gpio", label: "GPIO35", side: "right", row: 5, capabilities: ["digital", "adc", "input_only"] },
  { gpio: 32, kind: "gpio", label: "GPIO32", side: "right", row: 6, capabilities: ["digital", "adc", "touch"] },
  { gpio: 33, kind: "gpio", label: "GPIO33", side: "right", row: 7, capabilities: ["digital", "adc", "touch"] },
  { gpio: 25, kind: "gpio", label: "GPIO25", alt: ["DAC1"], side: "right", row: 8, capabilities: ["digital", "adc", "dac"] },
  { gpio: 26, kind: "gpio", label: "GPIO26", alt: ["DAC2"], side: "right", row: 9, capabilities: ["digital", "adc", "dac"] },
  { gpio: 27, kind: "gpio", label: "GPIO27", side: "right", row: 10, capabilities: ["digital", "adc", "touch"] },
  { gpio: 14, kind: "gpio", label: "GPIO14", side: "right", row: 11, capabilities: ["digital", "adc", "touch"] },
  { gpio: 12, kind: "gpio", label: "GPIO12", side: "right", row: 12, capabilities: ["digital", "adc", "touch", "strapping"] },
  { gpio: null, kind: "ground", label: "GND", side: "right", row: 13 },
  { gpio: 13, kind: "gpio", label: "GPIO13", side: "right", row: 14, capabilities: ["digital", "adc", "touch"] },
  { gpio: 9, kind: "gpio", label: "GPIO9", alt: ["SD2"], side: "right", row: 15, capabilities: ["digital", "flash"] },
  { gpio: 10, kind: "gpio", label: "GPIO10", alt: ["SD3"], side: "right", row: 16, capabilities: ["digital", "flash"] },
  { gpio: 11, kind: "gpio", label: "GPIO11", alt: ["CMD"], side: "right", row: 17, capabilities: ["digital", "flash"] },
  { gpio: null, kind: "power", label: "5V", side: "right", row: 18 },
];

const left: PinDescriptor[] = [
  { gpio: null, kind: "ground", label: "GND", side: "left", row: 0 },
  { gpio: 23, kind: "gpio", label: "GPIO23", alt: ["MOSI"], side: "left", row: 1, capabilities: ["digital"] },
  { gpio: 22, kind: "gpio", label: "GPIO22", alt: ["SCL"], side: "left", row: 2, capabilities: ["digital"] },
  { gpio: 1, kind: "gpio", label: "GPIO1", alt: ["TX0"], side: "left", row: 3, capabilities: ["digital", "uart"] },
  { gpio: 3, kind: "gpio", label: "GPIO3", alt: ["RX0"], side: "left", row: 4, capabilities: ["digital", "uart"] },
  { gpio: 21, kind: "gpio", label: "GPIO21", alt: ["SDA"], side: "left", row: 5, capabilities: ["digital"] },
  { gpio: null, kind: "ground", label: "GND", side: "left", row: 6 },
  { gpio: 19, kind: "gpio", label: "GPIO19", alt: ["MISO"], side: "left", row: 7, capabilities: ["digital"] },
  { gpio: 18, kind: "gpio", label: "GPIO18", alt: ["SCK"], side: "left", row: 8, capabilities: ["digital"] },
  { gpio: 5, kind: "gpio", label: "GPIO5", side: "left", row: 9, capabilities: ["digital", "strapping"] },
  { gpio: 17, kind: "gpio", label: "GPIO17", alt: ["TX2"], side: "left", row: 10, capabilities: ["digital"] },
  { gpio: 16, kind: "gpio", label: "GPIO16", alt: ["RX2"], side: "left", row: 11, capabilities: ["digital"] },
  { gpio: 4, kind: "gpio", label: "GPIO4", side: "left", row: 12, capabilities: ["digital", "adc", "touch"] },
  { gpio: 0, kind: "gpio", label: "GPIO0", alt: ["BOOT"], side: "left", row: 13, capabilities: ["digital", "adc", "touch", "strapping", "boot"] },
  { gpio: 2, kind: "gpio", label: "GPIO2", alt: ["LED"], side: "left", row: 14, capabilities: ["digital", "adc", "touch", "strapping", "led"] },
  { gpio: 15, kind: "gpio", label: "GPIO15", side: "left", row: 15, capabilities: ["digital", "adc", "touch", "strapping"] },
  { gpio: 8, kind: "gpio", label: "GPIO8", alt: ["SD1"], side: "left", row: 16, capabilities: ["digital", "flash"] },
  { gpio: 7, kind: "gpio", label: "GPIO7", alt: ["SD0"], side: "left", row: 17, capabilities: ["digital", "flash"] },
  { gpio: 6, kind: "gpio", label: "GPIO6", alt: ["CLK"], side: "left", row: 18, capabilities: ["digital", "flash"] },
];

export const ESP32_DEVKITC_V4: BoardLayout = {
  id: "esp32-devkitc-v4",
  name: "ESP32-DevKitC-V4",
  aliases: ["esp32-devkitc-v4", "esp32-devkitc", "esp32-dev", "esp32"],
  chips: ["ESP32"],
  usbSide: "bottom",
  rowsPerSide: 19,
  pins: [...right, ...left],
};
