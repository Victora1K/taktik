import { afterEach, describe, expect, it } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { addToken, updateTokens } from "@/lib/collab/actions";
import { createDoc, docToState } from "@/lib/collab/doc";
import { YjsProvider } from "@/lib/collab/provider";
import { MemoryHub } from "@/lib/collab/transport";
import { createInitialState } from "@/lib/engine/factory";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const providers: YjsProvider[] = [];

function peer(hub: MemoryHub, doc: Y.Doc, readOnly = false) {
  const awareness = new Awareness(doc);
  const p = new YjsProvider(doc, awareness, hub.create(), { readOnly });
  providers.push(p);
  return { doc, awareness, p };
}

afterEach(() => {
  providers.splice(0).forEach((p) => p.destroy());
});

describe("YjsProvider", () => {
  it("syncs initial state to a late joiner and live edits both ways", async () => {
    const hub = new MemoryHub();
    const a = peer(hub, createDoc(createInitialState({ sport: "volleyball", homeCount: 6, awayCount: 6 })));
    await sleep(10);
    const b = peer(hub, new Y.Doc());
    await sleep(20);
    expect(Object.keys(docToState(b.doc).tokens)).toHaveLength(13);

    const t = addToken(b.doc, "neutral", 1, 1, { label: "coach" });
    await sleep(80);
    expect(docToState(a.doc).tokens[t.id]?.label).toBe("coach");

    updateTokens(a.doc, [t.id], { label: "assistant" });
    await sleep(80);
    expect(docToState(b.doc).tokens[t.id]?.label).toBe("assistant");
  });

  it("merges edits made while two peers were offline from each other", async () => {
    const base = createDoc(
      createInitialState({ sport: "soccer", homeCount: 1, awayCount: 1, includeBall: false }),
    );
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(base));
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(base));
    const ta = addToken(docA, "home", 1, 1);
    const tb = addToken(docB, "away", 2, 2);

    const hub = new MemoryHub();
    peer(hub, docA);
    await sleep(5);
    peer(hub, docB);
    await sleep(120);
    for (const d of [docA, docB]) {
      const ids = Object.keys(docToState(d).tokens);
      expect(ids).toContain(ta.id);
      expect(ids).toContain(tb.id);
    }
  });

  it("shares awareness (cursors, locks) between peers", async () => {
    const hub = new MemoryHub();
    const a = peer(hub, new Y.Doc());
    const b = peer(hub, new Y.Doc());
    a.awareness.setLocalState({ user: { id: "u1", name: "Alex", color: "#f00" }, locked: ["tok9"] });
    await sleep(80);
    const seen = b.awareness.getStates().get(a.doc.clientID) as { user: { name: string }; locked: string[] };
    expect(seen.user.name).toBe("Alex");
    expect(seen.locked).toEqual(["tok9"]);
  });

  it("read-only peers receive updates but never send document data", async () => {
    const hub = new MemoryHub();
    const editor = peer(
      hub,
      createDoc(createInitialState({ sport: "basketball", homeCount: 1, awayCount: 0, includeBall: false })),
    );
    const viewer = peer(hub, new Y.Doc(), true);
    await sleep(20);
    expect(Object.keys(docToState(viewer.doc).tokens)).toHaveLength(1);
    const local = addToken(viewer.doc, "away", 1, 1);
    await sleep(80);
    expect(docToState(editor.doc).tokens[local.id]).toBeUndefined();
  });

  it("chunks large updates and reassembles them", async () => {
    const hub = new MemoryHub();
    const a = peer(hub, new Y.Doc());
    const b = peer(hub, new Y.Doc());
    await sleep(5);
    a.doc.transact(() => {
      const m = a.doc.getMap("annotations");
      for (let i = 0; i < 400; i++)
        m.set(`n${i}`, {
          id: `n${i}`,
          kind: "freehand",
          points: Array.from({ length: 200 }, () => Math.random()),
          style: { color: "#fff", width: 0.2, dashed: false },
        });
    });
    await sleep(150);
    expect(b.doc.getMap("annotations").size).toBe(400);
  });
});
