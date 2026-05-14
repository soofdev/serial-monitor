import { parseLine } from "./protocol";
import type { PinStore } from "./store";

/**
 * Splits the raw serial stream into lines, routes recognised protocol lines
 * into the pin store, and returns the text that should still appear in the
 * terminal. Partial lines (not yet terminated by \n) are buffered until the
 * line completes so we don't display half a protocol marker.
 */
export class PinInterceptor {
  showProtocol = false;

  private buffer = "";
  private store: PinStore;

  constructor(store: PinStore) {
    this.store = store;
  }

  process(raw: string): string {
    const text = this.buffer + raw;
    let out = "";
    let cursor = 0;

    while (true) {
      const nl = text.indexOf("\n", cursor);
      if (nl === -1) break;
      // Line WITHOUT trailing \n; may still have \r.
      const line = text.slice(cursor, nl);
      const stripped = line.endsWith("\r") ? line.slice(0, -1) : line;
      const event = parseLine(stripped);
      if (event) {
        this.store.apply(event);
        if (this.showProtocol) out += line + "\n";
      } else {
        out += line + "\n";
      }
      cursor = nl + 1;
    }

    this.buffer = text.slice(cursor);
    return out;
  }

  reset(): void {
    this.buffer = "";
  }
}
