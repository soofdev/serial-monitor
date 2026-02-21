import { describe, it, expect, vi, beforeEach } from "vitest";
import { Connection } from "./connection";

vi.mock("./connection");

function createMockConnection() {
  const panel = document.createElement("div");
  panel.className = "connection-panel";
  return {
    panel,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    show: vi.fn(() => {
      panel.style.display = "flex";
    }),
    hide: vi.fn(() => {
      panel.style.display = "none";
    }),
    onStatusChange: null as ((status: string) => void) | null,
  };
}

import { TabManager } from "./tab-manager";

let tabBar: HTMLElement;
let panelContainer: HTMLElement;
let onEmpty: ReturnType<typeof vi.fn>;
let tm: TabManager;

beforeEach(() => {
  document.body.innerHTML = "";

  tabBar = document.createElement("div");
  const addBtn = document.createElement("button");
  addBtn.className = "tab-add";
  tabBar.appendChild(addBtn);

  panelContainer = document.createElement("div");
  document.body.appendChild(tabBar);
  document.body.appendChild(panelContainer);

  onEmpty = vi.fn();
  tm = new TabManager(tabBar, panelContainer, onEmpty);

  vi.mocked(Connection).mockImplementation(function () {
    return createMockConnection() as any;
  });
});

// ── addConnection ──────────────────────────────────────────────

describe("addConnection", () => {
  it("adds a tab element to the tab bar", async () => {
    await tm.addConnection("/dev/ttyUSB0", 115200);
    const tab = tabBar.querySelector('.tab[data-port="/dev/ttyUSB0"]');
    expect(tab).not.toBeNull();
  });

  it("calls conn.connect()", async () => {
    await tm.addConnection("/dev/ttyUSB0", 115200);
    const conn = tm.getActiveConnection()!;
    expect(conn.connect).toHaveBeenCalledOnce();
  });

  it("switches to the new tab (panel shown, tab-active class)", async () => {
    await tm.addConnection("/dev/ttyUSB0", 115200);
    const conn = tm.getActiveConnection()!;
    expect(conn.show).toHaveBeenCalled();
    const tab = tabBar.querySelector('.tab[data-port="/dev/ttyUSB0"]');
    expect(tab!.classList.contains("tab-active")).toBe(true);
  });

  it("switches to existing tab without creating duplicate", async () => {
    await tm.addConnection("/dev/ttyUSB0", 115200);
    await tm.addConnection("COM3", 9600);
    await tm.addConnection("/dev/ttyUSB0", 115200);

    const tabs = tabBar.querySelectorAll('.tab[data-port="/dev/ttyUSB0"]');
    expect(tabs.length).toBe(1);
    expect(
      tabBar.querySelector('.tab[data-port="/dev/ttyUSB0"]')!.classList.contains("tab-active")
    ).toBe(true);
  });

  it("cleans up DOM and map on connect failure, re-throws", async () => {
    const error = new Error("port busy");
    vi.mocked(Connection).mockImplementationOnce(function () {
      const panel = document.createElement("div");
      return {
        panel,
        connect: vi.fn().mockRejectedValue(error),
        disconnect: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
        onStatusChange: null,
      } as any;
    });

    await expect(tm.addConnection("/dev/fail", 115200)).rejects.toThrow("port busy");
    expect(tm.hasConnection("/dev/fail")).toBe(false);
    expect(tabBar.querySelector('.tab[data-port="/dev/fail"]')).toBeNull();
  });
});

// ── switchTo ───────────────────────────────────────────────────

describe("switchTo", () => {
  it("shows selected panel and hides others", async () => {
    await tm.addConnection("/dev/ttyUSB0", 115200);
    const conn0 = tm.getActiveConnection()!;
    await tm.addConnection("COM3", 9600);
    const conn1 = tm.getActiveConnection()!;

    tm.switchTo("/dev/ttyUSB0");

    expect(conn0.show).toHaveBeenCalled();
    expect(conn1.hide).toHaveBeenCalled();
  });

  it("sets tab-active class on selected, removes from others", async () => {
    await tm.addConnection("/dev/ttyUSB0", 115200);
    await tm.addConnection("COM3", 9600);

    tm.switchTo("/dev/ttyUSB0");

    expect(
      tabBar.querySelector('.tab[data-port="/dev/ttyUSB0"]')!.classList.contains("tab-active")
    ).toBe(true);
    expect(
      tabBar.querySelector('.tab[data-port="COM3"]')!.classList.contains("tab-active")
    ).toBe(false);
  });

  it("is a no-op for unknown port", async () => {
    await tm.addConnection("/dev/ttyUSB0", 115200);
    const conn = tm.getActiveConnection()!;
    vi.mocked(conn.show).mockClear();

    tm.switchTo("BOGUS");

    expect(tm.getActiveConnection()).toBe(conn);
  });
});

// ── closeTab ──────────────────────────────────────────────────

describe("closeTab", () => {
  it("disconnects and removes panel + tab DOM", async () => {
    await tm.addConnection("/dev/ttyUSB0", 115200);
    const conn = tm.getActiveConnection()!;

    await tm.closeTab("/dev/ttyUSB0");

    expect(conn.disconnect).toHaveBeenCalledOnce();
    expect(tabBar.querySelector('.tab[data-port="/dev/ttyUSB0"]')).toBeNull();
    expect(tm.hasConnection("/dev/ttyUSB0")).toBe(false);
  });

  it("switches to remaining tab if any", async () => {
    await tm.addConnection("/dev/ttyUSB0", 115200);
    await tm.addConnection("COM3", 9600);

    await tm.closeTab("COM3");

    expect(tm.getActiveConnection()).not.toBeNull();
    expect(
      tabBar.querySelector('.tab[data-port="/dev/ttyUSB0"]')!.classList.contains("tab-active")
    ).toBe(true);
  });

  it("calls onEmpty when last tab closed", async () => {
    await tm.addConnection("/dev/ttyUSB0", 115200);
    await tm.closeTab("/dev/ttyUSB0");

    expect(onEmpty).toHaveBeenCalledOnce();
  });
});

// ── hideAll ───────────────────────────────────────────────────

describe("hideAll", () => {
  it("hides all panels and removes tab-active", async () => {
    await tm.addConnection("/dev/ttyUSB0", 115200);
    await tm.addConnection("COM3", 9600);

    tm.hideAll();

    const conn0 = tm["tabs"].get("/dev/ttyUSB0")!;
    const conn1 = tm["tabs"].get("COM3")!;
    expect(conn0.hide).toHaveBeenCalled();
    expect(conn1.hide).toHaveBeenCalled();

    tabBar.querySelectorAll(".tab").forEach((tab) => {
      expect(tab.classList.contains("tab-active")).toBe(false);
    });
  });

  it("sets active tab to null", async () => {
    await tm.addConnection("/dev/ttyUSB0", 115200);
    tm.hideAll();
    expect(tm.getActiveConnection()).toBeNull();
  });
});

// ── switchNext ────────────────────────────────────────────────

describe("switchNext", () => {
  it("cycles forward through tabs", async () => {
    await tm.addConnection("A", 9600);
    await tm.addConnection("B", 9600);
    await tm.addConnection("C", 9600);

    tm.switchNext(); // wraps to A
    expect(tabBar.querySelector('.tab[data-port="A"]')!.classList.contains("tab-active")).toBe(true);

    tm.switchNext(); // B
    expect(tabBar.querySelector('.tab[data-port="B"]')!.classList.contains("tab-active")).toBe(true);
  });

  it("wraps around from last to first", async () => {
    await tm.addConnection("A", 9600);
    await tm.addConnection("B", 9600);
    tm.switchTo("B");

    tm.switchNext();
    expect(tabBar.querySelector('.tab[data-port="A"]')!.classList.contains("tab-active")).toBe(true);
  });

  it("is a no-op when no tabs exist", () => {
    tm.switchNext();
    expect(tm.getActiveConnection()).toBeNull();
  });
});

// ── switchPrev ────────────────────────────────────────────────

describe("switchPrev", () => {
  it("cycles backward through tabs", async () => {
    await tm.addConnection("A", 9600);
    await tm.addConnection("B", 9600);
    await tm.addConnection("C", 9600);

    tm.switchPrev(); // B
    expect(tabBar.querySelector('.tab[data-port="B"]')!.classList.contains("tab-active")).toBe(true);

    tm.switchPrev(); // A
    expect(tabBar.querySelector('.tab[data-port="A"]')!.classList.contains("tab-active")).toBe(true);
  });

  it("wraps around from first to last", async () => {
    await tm.addConnection("A", 9600);
    await tm.addConnection("B", 9600);
    tm.switchTo("A");

    tm.switchPrev();
    expect(tabBar.querySelector('.tab[data-port="B"]')!.classList.contains("tab-active")).toBe(true);
  });

  it("is a no-op when no tabs exist", () => {
    tm.switchPrev();
    expect(tm.getActiveConnection()).toBeNull();
  });
});

// ── hasConnection ─────────────────────────────────────────────

describe("hasConnection", () => {
  it("returns true for connected ports", async () => {
    await tm.addConnection("/dev/ttyUSB0", 115200);
    expect(tm.hasConnection("/dev/ttyUSB0")).toBe(true);
  });

  it("returns false for unknown ports", () => {
    expect(tm.hasConnection("NOPE")).toBe(false);
  });
});

// ── getActiveConnection ───────────────────────────────────────

describe("getActiveConnection", () => {
  it("returns the active Connection", async () => {
    await tm.addConnection("/dev/ttyUSB0", 115200);
    const conn = tm.getActiveConnection();
    expect(conn).not.toBeNull();
    expect(conn!.panel).toBeInstanceOf(HTMLElement);
  });

  it("returns null when no tabs exist", () => {
    expect(tm.getActiveConnection()).toBeNull();
  });

  it("returns null after hideAll", async () => {
    await tm.addConnection("/dev/ttyUSB0", 115200);
    tm.hideAll();
    expect(tm.getActiveConnection()).toBeNull();
  });
});
