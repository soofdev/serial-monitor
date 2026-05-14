import type { BoardLayout, PinDescriptor } from "./boards";
import type { PinStore } from "./store";

const SVG_NS = "http://www.w3.org/2000/svg";

// Layout constants (SVG user units).
const ROW_HEIGHT = 22;
const TOP_PADDING = 56;
const BOTTOM_PADDING = 16;
const BOARD_WIDTH = 220;
const PIN_RADIUS = 7;
const PIN_GUTTER = 14;
const LABEL_GUTTER = 6;
const LABEL_AREA_WIDTH = 80;
const USB_WIDTH = 60;
const USB_HEIGHT = 22;

export class BoardView {
  readonly element: HTMLElement;
  private svg: SVGSVGElement;
  private tooltip: HTMLElement;
  private store: PinStore;
  private board: BoardLayout;
  private unsubscribe: (() => void) | null = null;
  private pinGroups = new Map<number, SVGGElement>();
  private specialGroups: SVGGElement[] = [];

  constructor(container: HTMLElement, store: PinStore, board: BoardLayout) {
    this.store = store;
    this.board = board;

    this.element = document.createElement("div");
    this.element.className = "board-view";

    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.classList.add("board-svg");
    this.svg.setAttribute("xmlns", SVG_NS);
    this.svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    this.element.appendChild(this.svg);

    this.tooltip = document.createElement("div");
    this.tooltip.className = "board-tooltip";
    this.tooltip.style.display = "none";
    this.element.appendChild(this.tooltip);

    container.appendChild(this.element);

    this.renderBoard();
    this.repaintAll();

    this.unsubscribe = this.store.subscribe((changed) => {
      if (changed.size === 0) {
        this.repaintAll();
      } else {
        for (const pin of changed) this.repaintPin(pin);
      }
    });
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.element.remove();
  }

  setBoard(board: BoardLayout): void {
    this.board = board;
    this.renderBoard();
    this.repaintAll();
  }

  private renderBoard(): void {
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    this.pinGroups.clear();
    this.specialGroups = [];

    const totalRows = this.board.rowsPerSide;
    const innerHeight = totalRows * ROW_HEIGHT;
    const height = TOP_PADDING + innerHeight + BOTTOM_PADDING;
    const width =
      LABEL_AREA_WIDTH * 2 +
      PIN_GUTTER * 2 +
      PIN_RADIUS * 4 +
      BOARD_WIDTH;

    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const boardX = LABEL_AREA_WIDTH + PIN_GUTTER + PIN_RADIUS * 2;
    const boardY = TOP_PADDING - ROW_HEIGHT / 2;
    const boardHeight = innerHeight + ROW_HEIGHT;

    // USB-C connector indicator on top edge.
    const usb = el("rect", {
      class: "board-usb",
      x: boardX + BOARD_WIDTH / 2 - USB_WIDTH / 2,
      y: boardY - USB_HEIGHT + 4,
      width: USB_WIDTH,
      height: USB_HEIGHT,
      rx: 4,
    });
    this.svg.appendChild(usb);

    // Board body.
    const body = el("rect", {
      class: "board-body",
      x: boardX,
      y: boardY,
      width: BOARD_WIDTH,
      height: boardHeight,
      rx: 8,
    });
    this.svg.appendChild(body);

    // Title.
    const title = el("text", {
      class: "board-title",
      x: boardX + BOARD_WIDTH / 2,
      y: boardY + boardHeight / 2,
      "text-anchor": "middle",
    });
    title.textContent = this.board.name;
    this.svg.appendChild(title);

    // Pins.
    for (const pin of this.board.pins) {
      const group = this.renderPin(pin, boardX, boardY);
      this.svg.appendChild(group);
    }
  }

  private renderPin(pin: PinDescriptor, boardX: number, boardY: number): SVGGElement {
    const y = boardY + ROW_HEIGHT / 2 + pin.row * ROW_HEIGHT;
    const isLeft = pin.side === "left";
    const cx = isLeft
      ? boardX - PIN_GUTTER - PIN_RADIUS
      : boardX + BOARD_WIDTH + PIN_GUTTER + PIN_RADIUS;
    const labelX = isLeft
      ? cx - PIN_RADIUS - LABEL_GUTTER
      : cx + PIN_RADIUS + LABEL_GUTTER;

    const group = el("g", { class: "pin-group" }) as SVGGElement;
    group.dataset.kind = pin.kind;
    if (pin.gpio !== null) group.dataset.gpio = String(pin.gpio);
    group.dataset.side = pin.side;

    const pad = el("circle", {
      class: "pin-pad",
      cx,
      cy: y,
      r: PIN_RADIUS,
    });
    group.appendChild(pad);

    const label = el("text", {
      class: "pin-label",
      x: labelX,
      y: y + 4,
      "text-anchor": isLeft ? "end" : "start",
    });
    label.textContent = pin.label;
    group.appendChild(label);

    group.addEventListener("mouseenter", (e) => this.showTooltip(pin, e as MouseEvent));
    group.addEventListener("mousemove", (e) => this.moveTooltip(e as MouseEvent));
    group.addEventListener("mouseleave", () => this.hideTooltip());

    if (pin.gpio !== null) {
      this.pinGroups.set(pin.gpio, group);
    } else {
      this.specialGroups.push(group);
    }

    return group;
  }

  private repaintAll(): void {
    for (const group of this.specialGroups) this.applySpecialClasses(group);
    for (const [gpio, group] of this.pinGroups) this.applyGpioClasses(gpio, group);
  }

  private repaintPin(gpio: number): void {
    const group = this.pinGroups.get(gpio);
    if (group) this.applyGpioClasses(gpio, group);
  }

  private applySpecialClasses(group: SVGGElement): void {
    group.classList.remove("pin-low", "pin-high", "pin-analog", "pin-pwm");
    const kind = group.dataset.kind ?? "";
    group.classList.add(`pin-kind-${kind}`);
  }

  private applyGpioClasses(gpio: number, group: SVGGElement): void {
    group.classList.add("pin-kind-gpio");
    group.classList.remove("pin-unknown", "pin-low", "pin-high", "pin-analog", "pin-pwm");
    const info = this.store.get(gpio);
    if (!info?.value) {
      group.classList.add("pin-unknown");
      return;
    }
    switch (info.value.type) {
      case "digital":
        group.classList.add(info.value.level === 1 ? "pin-high" : "pin-low");
        break;
      case "analog":
        group.classList.add("pin-analog");
        break;
      case "pwm":
        group.classList.add("pin-pwm");
        break;
    }
  }

  private showTooltip(pin: PinDescriptor, e: MouseEvent): void {
    const lines: string[] = [];
    lines.push(pin.label);
    if (pin.alt && pin.alt.length > 0) lines.push(pin.alt.join(" · "));
    if (pin.gpio !== null) {
      const info = this.store.get(pin.gpio);
      if (info?.mode) lines.push(`mode: ${info.mode}`);
      if (info?.value) lines.push(`value: ${formatValue(info.value)}`);
      else lines.push("value: unknown");
    } else {
      lines.push(`(${pin.kind})`);
    }
    if (pin.capabilities && pin.capabilities.length > 0) {
      lines.push(pin.capabilities.join(", "));
    }
    this.tooltip.textContent = lines.join("\n");
    this.tooltip.style.display = "block";
    this.moveTooltip(e);
  }

  private moveTooltip(e: MouseEvent): void {
    const rect = this.element.getBoundingClientRect();
    const x = e.clientX - rect.left + 12;
    const y = e.clientY - rect.top + 12;
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
  }

  private hideTooltip(): void {
    this.tooltip.style.display = "none";
  }
}

function formatValue(value: NonNullable<ReturnType<PinStore["get"]>>["value"]): string {
  if (!value) return "unknown";
  switch (value.type) {
    case "digital":
      return value.level === 1 ? "HIGH" : "LOW";
    case "analog":
      return `analog ${value.raw}`;
    case "pwm":
      return `pwm ${value.duty}`;
  }
}

function el<T extends keyof SVGElementTagNameMap>(
  tag: T,
  attrs: Record<string, string | number>
): SVGElementTagNameMap[T] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  return node;
}
