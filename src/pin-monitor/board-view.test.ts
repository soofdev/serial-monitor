import { describe, expect, it, beforeEach } from "vitest";
import { BoardView } from "./board-view";
import { PinStore } from "./store";
import { ESP32_S3_DEVKITC_1 } from "./boards/esp32-s3-devkitc-1";

function makeView() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const store = new PinStore({ flushIntervalMs: 0, now: () => 0 });
  const view = new BoardView(container, store, ESP32_S3_DEVKITC_1);
  return { container, store, view };
}

describe("BoardView render", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts an SVG into the container", () => {
    const { container } = makeView();
    expect(container.querySelector("svg.board-svg")).not.toBeNull();
  });

  it("renders one group per pin", () => {
    const { container } = makeView();
    const groups = container.querySelectorAll("g.pin-group");
    expect(groups).toHaveLength(ESP32_S3_DEVKITC_1.pins.length);
  });

  it("starts every GPIO as 'unknown'", () => {
    const { container } = makeView();
    const gpioGroups = container.querySelectorAll("g.pin-group[data-gpio]");
    for (const g of gpioGroups) {
      expect(g.classList.contains("pin-unknown")).toBe(true);
    }
  });

  it("repaints to pin-high when store receives a HIGH event", () => {
    const { container, store } = makeView();
    store.apply({ kind: "state", pins: [{ pin: 5, value: { type: "digital", level: 1 } }] });
    const group = container.querySelector('g.pin-group[data-gpio="5"]')!;
    expect(group.classList.contains("pin-high")).toBe(true);
    expect(group.classList.contains("pin-unknown")).toBe(false);
  });

  it("transitions from HIGH back to LOW", () => {
    const { container, store } = makeView();
    store.apply({ kind: "state", pins: [{ pin: 5, value: { type: "digital", level: 1 } }] });
    store.apply({ kind: "state", pins: [{ pin: 5, value: { type: "digital", level: 0 } }] });
    const group = container.querySelector('g.pin-group[data-gpio="5"]')!;
    expect(group.classList.contains("pin-low")).toBe(true);
    expect(group.classList.contains("pin-high")).toBe(false);
  });

  it("destroy() removes the element and unsubscribes", () => {
    const { container, store, view } = makeView();
    view.destroy();
    expect(container.querySelector("svg.board-svg")).toBeNull();
    // Should not throw after destroy.
    store.apply({ kind: "state", pins: [{ pin: 5, value: { type: "digital", level: 1 } }] });
  });
});
