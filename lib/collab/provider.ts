import * as awarenessProtocol from "y-protocols/awareness";
import * as Y from "yjs";
import { fromBase64, toBase64 } from "./encoding";
import type { Payload, Transport, TransportStatus } from "./transport";

const BATCH_MS = 50;
/**
 * Awareness (cursors, live drags) fans out to every peer, so deliveries grow with n*(n-1). Keep a room near this
 * many deliveries per second (Supabase Realtime meters messages per project), between 2 and 12 updates/s per sender.
 */
const AWARENESS_BUDGET_PER_S = 150;
/** Supabase broadcast messages are capped (256 KB on the free tier); stay well below. */
const CHUNK_CHARS = 120_000;

/**
 * Syncs a Y.Doc and its Awareness over a Transport.
 *
 * Protocol: on connect a peer broadcasts `sync-req` with its state vector; every peer answers with a
 * `sync-res` addressed to it containing the missing updates plus its own state vector, and the requester
 * replies with whatever the responder is missing. Local edits are batched and broadcast as `update`.
 */
export class YjsProvider {
  readonly doc: Y.Doc;
  readonly awareness: awarenessProtocol.Awareness;
  status: TransportStatus = "connecting";
  synced = false;

  private transport: Transport;
  private readOnly: boolean;
  private pending: Uint8Array[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private awarenessDirty = new Set<number>();
  private awarenessTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAwarenessAt = 0;
  private chunks = new Map<string, { parts: string[]; received: number }>();
  private listeners = new Set<() => void>();
  private unsubs: (() => void)[] = [];

  constructor(
    doc: Y.Doc,
    awareness: awarenessProtocol.Awareness,
    transport: Transport,
    opts: { readOnly?: boolean } = {},
  ) {
    this.doc = doc;
    this.awareness = awareness;
    this.transport = transport;
    this.readOnly = !!opts.readOnly;

    doc.on("update", this.handleDocUpdate);
    awareness.on("update", this.handleAwarenessUpdate);
    this.unsubs.push(transport.onMessage(this.handleMessage));
    this.unsubs.push(
      transport.onStatus((s) => {
        this.status = s;
        if (s === "connected") this.requestSync();
        this.emit();
      }),
    );
    transport.connect();
  }

  /** Subscribe to status/synced changes. */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  destroy() {
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], "destroy");
    this.flushAwareness();
    this.flush();
    this.doc.off("update", this.handleDocUpdate);
    this.awareness.off("update", this.handleAwarenessUpdate);
    this.unsubs.forEach((u) => u());
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.awarenessTimer) clearTimeout(this.awarenessTimer);
    this.transport.destroy();
    this.listeners.clear();
  }

  private emit() {
    this.listeners.forEach((cb) => cb());
  }

  private requestSync() {
    this.transport.send("sync-req", { from: this.doc.clientID, sv: toBase64(Y.encodeStateVector(this.doc)) });
    this.broadcastFullAwareness();
    // A lone client never gets a sync-res; treat it as synced after a short grace period.
    setTimeout(() => {
      if (!this.synced) {
        this.synced = true;
        this.emit();
      }
    }, 1500);
  }

  private broadcastFullAwareness() {
    const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID]);
    this.transport.send("awareness", { u: toBase64(update) });
  }

  private sendBinary(event: string, fields: Payload, key: string, bytes: Uint8Array) {
    const data = toBase64(bytes);
    if (data.length <= CHUNK_CHARS) {
      this.transport.send(event, { ...fields, [key]: data });
      return;
    }
    const id = `${this.doc.clientID}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const n = Math.ceil(data.length / CHUNK_CHARS);
    for (let i = 0; i < n; i++) {
      this.transport.send("chunk", {
        id,
        i,
        n,
        event,
        key,
        fields,
        data: data.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS),
      });
    }
  }

  private handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this || this.readOnly) return;
    this.pending.push(update);
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), BATCH_MS);
  };

  private flush() {
    this.flushTimer = null;
    if (!this.pending.length) return;
    const merged = Y.mergeUpdates(this.pending);
    this.pending = [];
    this.sendBinary("update", {}, "u", merged);
  }

  private handleAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === this) return;
    for (const id of [...added, ...updated, ...removed]) this.awarenessDirty.add(id);
    if (this.awarenessTimer) return;
    const wait = this.lastAwarenessAt + this.awarenessInterval() - Date.now();
    if (wait <= 0) this.flushAwareness();
    else this.awarenessTimer = setTimeout(() => this.flushAwareness(), wait);
  };

  private awarenessInterval() {
    const n = Math.max(2, this.awareness.getStates().size);
    const hz = Math.min(12, Math.max(2, AWARENESS_BUDGET_PER_S / (n * (n - 1))));
    return 1000 / hz;
  }

  private flushAwareness() {
    this.awarenessTimer = null;
    if (!this.awarenessDirty.size) return;
    this.lastAwarenessAt = Date.now();
    const ids = [...this.awarenessDirty];
    this.awarenessDirty.clear();
    const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, ids);
    this.transport.send("awareness", { u: toBase64(update) });
  }

  private handleMessage = (event: string, payload: Payload) => {
    if (event === "chunk") return this.handleChunk(payload);
    switch (event) {
      case "sync-req": {
        // Viewers are not allowed to send document data (enforced server-side too), so only share presence.
        if (this.readOnly) {
          this.broadcastFullAwareness();
          break;
        }
        const sv = fromBase64(payload.sv as string);
        const diff = Y.encodeStateAsUpdate(this.doc, sv);
        this.sendBinary(
          "sync-res",
          { to: payload.from, from: this.doc.clientID, sv: toBase64(Y.encodeStateVector(this.doc)) },
          "u",
          diff,
        );
        this.broadcastFullAwareness();
        break;
      }
      case "sync-res": {
        if (payload.to !== this.doc.clientID) break;
        Y.applyUpdate(this.doc, fromBase64(payload.u as string), this);
        if (!this.readOnly) {
          const theirs = fromBase64(payload.sv as string);
          const missing = Y.encodeStateAsUpdate(this.doc, theirs);
          // An empty update is 2 bytes; only send real content.
          if (missing.length > 2) this.sendBinary("update", {}, "u", missing);
        }
        if (!this.synced) {
          this.synced = true;
          this.emit();
        }
        break;
      }
      case "update":
        Y.applyUpdate(this.doc, fromBase64(payload.u as string), this);
        break;
      case "awareness":
        awarenessProtocol.applyAwarenessUpdate(this.awareness, fromBase64(payload.u as string), this);
        break;
    }
  };

  private handleChunk(p: Payload) {
    const id = p.id as string;
    const n = p.n as number;
    let entry = this.chunks.get(id);
    if (!entry) {
      entry = { parts: new Array(n), received: 0 };
      this.chunks.set(id, entry);
    }
    if (entry.parts[p.i as number] === undefined) entry.received++;
    entry.parts[p.i as number] = p.data as string;
    if (entry.received === n) {
      this.chunks.delete(id);
      this.handleMessage(p.event as string, {
        ...(p.fields as Payload),
        [p.key as string]: entry.parts.join(""),
      });
    }
  }
}
