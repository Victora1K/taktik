import { create } from "zustand";
import type { Comment } from "@/lib/data/types";

export const useComments = create<{ comments: Comment[]; loaded: boolean }>(() => ({
  comments: [],
  loaded: false,
}));

/** How close (ms) the playhead must be to a timestamped comment for its field pin to show. */
export const PIN_WINDOW_MS = 1500;
