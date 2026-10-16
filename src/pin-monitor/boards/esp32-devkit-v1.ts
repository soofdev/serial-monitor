import type { BoardLayout, PinDescriptor } from "./types";

// ESP32 DevKit V1 (30-pin variant, a.k.a. DOIT / NodeMCU-32).
// Flash pins (GPIO 6–11) are NOT broken out on this board — safer for
// beginners than the 38-pin DevKitC. Rendered with USB at the bottom
// to match the physical layout where the microUSB sits below the pins.

const right: PinDescriptor[] = [
  { gpio: null, kind: "reset", label: "EN", side: "right", row: 0 },
  { gpio: 36, kind: "gpio", label: "GPIO36", alt: ["VP"], side: "right", row: 1, capabilities: ["digital", "adc", "input_only"] },
  { gpio: 39, kind: "gpio", label: "GPIO39", alt: ["VN"], side: "right", row: 2, capabilities: ["digital", "adc", "input_only"] },
  { gpio: 34, kind: "gpio", label: "GPIO34", side: "right", row: 3, capabilities: ["digital", "adc", "input_only"] },
  { gpio: 35, kind: "gpio", label: "GPIO35", side: "right", row: 4, capabilities: ["digital", "adc", "input_only"] },
  { gpio: 32, kind: "gpio", label: "GPIO32", side: "right", row: 5, capabilities: ["digital", "adc", "touch"] },
  { gpio: 33, kind: "gpio", label: "GPIO33", side: "right", row: 6, capabilities: ["digital", "adc", "touch"] },
  { gpio: 25, kind: "gpio", label: "GPIO25", alt: ["DAC1"], side: "right", row: 7, capabilities: ["digital", "adc", "dac"] },
  { gpio: 26, kind: "gpio", label: "GPIO26", alt: ["DAC2"], side: "right", row: 8, capabilities: ["digital", "adc", "dac"] },
  { gpio: 27, kind: "gpio", label: "GPIO27", side: "right", row: 9, capabilities: ["digital", "adc", "touch"] },
  { gpio: 14, kind: "gpio", label: "GPIO14", side: "right", row: 10, capabilities: ["digital", "adc", "touch"] },
  { gpio: 12, kind: "gpio", label: "GPIO12", side: "right", row: 11, capabilities: ["digital", "adc", "touch", "strapping"] },
  { gpio: 13, kind: "gpio", label: "GPIO13", side: "right", row: 12, capabilities: ["digital", "adc", "touch"] },
  { gpio: null, kind: "ground", label: "GND", side: "right", row: 13 },
  { gpio: null, kind: "power", label: "VIN", side: "right", row: 14 },
];

const left: PinDescriptor[] = [
  { gpio: null, kind: "power", label: "3V3", side: "left", row: 0 },
  { gpio: null, kind: "ground", label: "GND", side: "left", row: 1 },
  { gpio: 15, kind: "gpio", label: "GPIO15", side: "left", row: 2, capabilities: ["digital", "adc", "touch", "strapping"] },
  { gpio: 2, kind: "gpio", label: "GPIO2", alt: ["LED"], side: "left", row: 3, capabilities: ["digital", "adc", "touch", "strapping", "led"] },
  { gpio: 4, kind: "gpio", label: "GPIO4", side: "left", row: 4, capabilities: ["digital", "adc", "touch"] },
  { gpio: 16, kind: "gpio", label: "GPIO16", alt: ["RX2"], side: "left", row: 5, capabilities: ["digital"] },
  { gpio: 17, kind: "gpio", label: "GPIO17", alt: ["TX2"], side: "left", row: 6, capabilities: ["digital"] },
  { gpio: 5, kind: "gpio", label: "GPIO5", side: "left", row: 7, capabilities: ["digital", "strapping"] },
  { gpio: 18, kind: "gpio", label: "GPIO18", alt: ["SCK"], side: "left", row: 8, capabilities: ["digital"] },
  { gpio: 19, kind: "gpio", label: "GPIO19", alt: ["MISO"], side: "left", row: 9, capabilities: ["digital"] },
  { gpio: 21, kind: "gpio", label: "GPIO21", alt: ["SDA"], side: "left", row: 10, capabilities: ["digital"] },
  { gpio: 3, kind: "gpio", label: "GPIO3", alt: ["RX0"], side: "left", row: 11, capabilities: ["digital", "uart"] },
  { gpio: 1, kind: "gpio", label: "GPIO1", alt: ["TX0"], side: "left", row: 12, capabilities: ["digital", "uart"] },
  { gpio: 22, kind: "gpio", label: "GPIO22", alt: ["SCL"], side: "left", row: 13, capabilities: ["digital"] },
  { gpio: 23, kind: "gpio", label: "GPIO23", alt: ["MOSI"], side: "left", row: 14, capabilities: ["digital"] },
];

export const ESP32_DEVKIT_V1: BoardLayout = {
  id: "esp32-devkit-v1",
  name: "ESP32 DevKit V1 (30-pin)",
  aliases: [
    "esp32-devkit-v1",
    "esp32-devkit-30",
    "esp32-doit",
    "esp32-nodemcu",
    "nodemcu-32s",
  ],
  // Same chip as the 38-pin DevKitC; ambiguity is resolved by user choice or $HELLO.
  chips: [],
  usbSide: "bottom",
  rowsPerSide: 15,
  pins: [...right, ...left],
};
