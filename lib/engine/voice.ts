import type { VoiceClip } from "./types";

export type VoiceMix = "cues" | "tape" | "both";

/** Clips that should be heard at `time`. Instruction cues sit on top of the general tape. */
export function activeVoice(clips: VoiceClip[], mix: VoiceMix, time: number): VoiceClip[] {
  return clips
    .filter((clip) => {
      if (clip.muted || clip.durationMs <= 0) return false;
      if (mix === "cues" && clip.kind !== "instruction") return false;
      if (mix === "tape" && clip.kind !== "tape") return false;
      return time >= clip.tStartMs && time < clip.tStartMs + clip.durationMs;
    })
    .sort((a, b) => a.tStartMs - b.tStartMs || a.id.localeCompare(b.id));
}

/** Tape is the base. Instruction cues replace it while they are active when combination playback ducks. */
export function voiceLayers(
  clips: VoiceClip[],
  mix: VoiceMix,
  time: number,
): { tape?: VoiceClip; cues: VoiceClip[] } {
  const active = activeVoice(clips, mix, time);
  return {
    tape: active.find((clip) => clip.kind === "tape"),
    cues: active.filter((clip) => clip.kind === "instruction"),
  };
}
