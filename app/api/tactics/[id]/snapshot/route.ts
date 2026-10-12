import { NextResponse, type NextRequest } from "next/server";
import * as Y from "yjs";
import { fromBase64, fromByteaHex, toByteaHex } from "@/lib/collab/encoding";
import { isSupabaseConfigured } from "@/lib/env";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getServerSupabase } from "@/lib/supabase/server";

const MAX_UPDATE_BYTES = 4 * 1024 * 1024;
const MAX_THUMB_CHARS = 400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Persist a client's full Yjs state. The stored state is merged with the incoming one (CRDT merge, so concurrent
 * savers never overwrite each other) and compacted. RLS ensures only team editors can write.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured) return NextResponse.json({ error: "not configured" }, { status: 501 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Per user, not per IP: a whole team on one network edits the same tactic.
  const limit = await rateLimit(`snapshot:${id}:${auth.user.id}`, 60, 60_000);
  if (!limit.ok) return tooManyRequests(limit);

  let body: { update?: string; thumbnail?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (typeof body.update !== "string" || body.update.length > (MAX_UPDATE_BYTES * 4) / 3) {
    return NextResponse.json({ error: "bad update" }, { status: 400 });
  }

  const { data: row, error } = await supabase
    .from("tactics")
    .select("id, doc_state, title")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const doc = new Y.Doc();
  try {
    const existing = fromByteaHex(row.doc_state as string | null);
    if (existing) Y.applyUpdate(doc, existing);
    Y.applyUpdate(doc, fromBase64(body.update));
  } catch {
    return NextResponse.json({ error: "invalid document update" }, { status: 400 });
  }
  const merged = Y.encodeStateAsUpdate(doc);
  const title = String(doc.getMap("meta").get("title") ?? row.title).slice(0, 120) || "Untitled tactic";

  const patch: Record<string, unknown> = { doc_state: toByteaHex(merged), title };

  if (typeof body.thumbnail === "string" && body.thumbnail.length < MAX_THUMB_CHARS) {
    const match = /^data:image\/(jpeg|png);base64,(.+)$/.exec(body.thumbnail);
    if (match) {
      const ext = match[1] === "png" ? "png" : "jpg";
      const path = `${id}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("thumbnails")
        .upload(path, Buffer.from(match[2], "base64"), { contentType: `image/${match[1]}`, upsert: true });
      if (!upErr) {
        const { data: pub } = supabase.storage.from("thumbnails").getPublicUrl(path);
        patch.thumbnail_url = `${pub.publicUrl}?v=${Date.now()}`;
      }
    }
  }

  // RLS turns an unauthorized update into a no-op, so ask for the row back to detect it.
  const { data: updated, error: upError } = await supabase
    .from("tactics")
    .update(patch)
    .eq("id", id)
    .select("id");
  if (upError) return NextResponse.json({ error: upError.message }, { status: 500 });
  if (!updated?.length) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return NextResponse.json({ ok: true, bytes: merged.length });
}
