import * as Y from "yjs";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

export interface SnapshotSink {
  save(update: Uint8Array, opts: { thumbnail?: string; beacon?: boolean }): Promise<void>;
}

/**
 * Persists the full document state on a debounce, when the tab is hidden, and on unload.
 * The sink merges with what is already stored, so concurrent savers never lose each other's edits.
 */
export class SnapshotSaver {
  status: SaveStatus = "saved";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastThumbAt = 0;
  private listeners = new Set<(s: SaveStatus) => void>();

  constructor(
    private doc: Y.Doc,
    private sink: SnapshotSink,
    private opts: {
      debounceMs?: number;
      thumbnail?: () => string | undefined;
      thumbnailEveryMs?: number;
    } = {},
  ) {
    doc.on("update", this.onUpdate);
    if (typeof window !== "undefined") {
      document.addEventListener("visibilitychange", this.onHide);
      window.addEventListener("pagehide", this.onUnload);
    }
  }

  subscribe(cb: (s: SaveStatus) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private setStatus(s: SaveStatus) {
    this.status = s;
    this.listeners.forEach((cb) => cb(s));
  }

  private onUpdate = () => {
    this.setStatus("unsaved");
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.opts.debounceMs ?? 3000);
  };

  private onHide = () => {
    if (document.visibilityState === "hidden" && this.status === "unsaved") void this.flush({ beacon: true });
  };

  private onUnload = () => {
    if (this.status === "unsaved") void this.flush({ beacon: true });
  };

  async flush(opts: { beacon?: boolean; forceThumbnail?: boolean } = {}) {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const update = Y.encodeStateAsUpdate(this.doc);
    let thumbnail: string | undefined;
    const every = this.opts.thumbnailEveryMs ?? 30_000;
    if (
      this.opts.thumbnail &&
      !opts.beacon &&
      (opts.forceThumbnail || Date.now() - this.lastThumbAt > every)
    ) {
      thumbnail = this.opts.thumbnail();
      if (thumbnail) this.lastThumbAt = Date.now();
    }
    this.setStatus("saving");
    try {
      await this.sink.save(update, { thumbnail, beacon: opts.beacon });
      if (this.status === "saving") this.setStatus("saved");
    } catch (err) {
      console.error("Failed to save tactic", err);
      this.setStatus("error");
      this.timer = setTimeout(() => void this.flush(), 10_000);
    }
  }

  destroy() {
    if (this.status === "unsaved") void this.flush({ beacon: true });
    if (this.timer) clearTimeout(this.timer);
    this.doc.off("update", this.onUpdate);
    if (typeof window !== "undefined") {
      document.removeEventListener("visibilitychange", this.onHide);
      window.removeEventListener("pagehide", this.onUnload);
    }
    this.listeners.clear();
  }
}
