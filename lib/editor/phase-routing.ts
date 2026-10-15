import { commitPhaseRoute } from "@/lib/collab/actions";
import { toast } from "@/components/ui/toast";
import { getSession, setPresence } from "./session";
import { useEditor } from "./store";

export function cancelRoute() {
  useEditor.setState({ routeDraft: null });
  setPresence({ locked: null });
}

export function finishRoute(): boolean {
  const session = getSession();
  const editor = useEditor.getState();
  const draft = editor.routeDraft;
  if (!session || !draft || !editor.activePhaseId || !editor.activeLayerId || draft.points.length < 2)
    return false;
  const track = commitPhaseRoute(session.doc, {
    phaseId: editor.activePhaseId,
    tokenId: draft.tokenId,
    layerId: editor.activeLayerId,
    points: draft.points,
    userId: session.userId,
  });
  if (!track) {
    toast("Draw at least one destination for this route");
    return false;
  }
  useEditor.setState({ routeDraft: null });
  setPresence({ locked: null });
  return true;
}
