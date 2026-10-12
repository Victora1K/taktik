import { isSupabaseConfigured } from "@/lib/env";
import { LocalDataStore } from "./local";
import { SupabaseDataStore } from "./supabase";
import type { DataStore } from "./types";

let store: DataStore | null = null;

export function getDataStore(): DataStore {
  if (!store) store = isSupabaseConfigured ? new SupabaseDataStore() : new LocalDataStore();
  return store;
}

export * from "./types";
