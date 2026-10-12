import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export type TransportStatus = "connecting" | "connected" | "disconnected";
export type Payload = Record<string, unknown>;

/** Minimal pub/sub channel that the Yjs provider runs on. Messages are never echoed to the sender. */
export interface Transport {
  connect(): void;
  send(event: string, payload: Payload): void;
  onMessage(cb: (event: string, payload: Payload) => void): () => void;
  onStatus(cb: (status: TransportStatus) => void): () => void;
  destroy(): void;
}

class Emitter {
  private messageCbs = new Set<(event: string, payload: Payload) => void>();
  private statusCbs = new Set<(status: TransportStatus) => void>();
  onMessage(cb: (event: string, payload: Payload) => void) {
    this.messageCbs.add(cb);
    return () => this.messageCbs.delete(cb);
  }
  onStatus(cb: (status: TransportStatus) => void) {
    this.statusCbs.add(cb);
    return () => this.statusCbs.delete(cb);
  }
  protected emitMessage(event: string, payload: Payload) {
    this.messageCbs.forEach((cb) => cb(event, payload));
  }
  protected emitStatus(status: TransportStatus) {
    this.statusCbs.forEach((cb) => cb(status));
  }
}

/** Same-browser transport (tabs/windows) used in local mode and in end-to-end tests. */
export class BroadcastChannelTransport extends Emitter implements Transport {
  private channel: BroadcastChannel | null = null;
  constructor(private name: string) {
    super();
  }
  connect() {
    this.channel = new BroadcastChannel(this.name);
    this.channel.onmessage = (e) => this.emitMessage(e.data.event, e.data.payload);
    this.emitStatus("connected");
  }
  send(event: string, payload: Payload) {
    this.channel?.postMessage({ event, payload });
  }
  destroy() {
    this.channel?.close();
    this.channel = null;
    this.emitStatus("disconnected");
  }
}

/** Supabase Realtime broadcast on a private channel; access is enforced by RLS on realtime.messages. */
export class SupabaseTransport extends Emitter implements Transport {
  private channel: RealtimeChannel | null = null;
  constructor(
    private supabase: SupabaseClient,
    private topic: string,
  ) {
    super();
  }
  connect() {
    this.emitStatus("connecting");
    void (async () => {
      await this.supabase.realtime.setAuth();
      const channel = this.supabase.channel(this.topic, {
        config: { broadcast: { self: false, ack: false }, private: true },
      });
      channel.on("broadcast", { event: "*" }, (msg) => this.emitMessage(msg.event, msg.payload as Payload));
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") this.emitStatus("connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED")
          this.emitStatus("disconnected");
      });
      this.channel = channel;
    })();
  }
  send(event: string, payload: Payload) {
    void this.channel?.send({ type: "broadcast", event, payload });
  }
  destroy() {
    if (this.channel) void this.supabase.removeChannel(this.channel);
    this.channel = null;
  }
}

/** In-memory hub for unit tests: every transport created from the same hub sees the others' messages. */
export class MemoryHub {
  private members = new Set<MemoryTransport>();
  create(): MemoryTransport {
    return new MemoryTransport(this);
  }
  join(t: MemoryTransport) {
    this.members.add(t);
  }
  leave(t: MemoryTransport) {
    this.members.delete(t);
  }
  publish(from: MemoryTransport, event: string, payload: Payload) {
    for (const m of this.members) if (m !== from) m.deliver(event, structuredClone(payload));
  }
}

export class MemoryTransport extends Emitter implements Transport {
  constructor(private hub: MemoryHub) {
    super();
  }
  connect() {
    this.hub.join(this);
    this.emitStatus("connected");
  }
  send(event: string, payload: Payload) {
    this.hub.publish(this, event, payload);
  }
  deliver(event: string, payload: Payload) {
    this.emitMessage(event, payload);
  }
  destroy() {
    this.hub.leave(this);
    this.emitStatus("disconnected");
  }
}
