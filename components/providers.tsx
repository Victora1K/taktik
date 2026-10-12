"use client";

import posthog from "posthog-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getDataStore, type DataStore, type Profile } from "@/lib/data";

interface SessionValue {
  data: DataStore;
  me: Profile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setMe: (p: Profile) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

let posthogStarted = false;

export function Providers({ children }: { children: React.ReactNode }) {
  const data = useMemo(() => getDataStore(), []);
  const [me, setMe] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setMe(await data.getMe());
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || posthogStarted) return;
    posthogStarted = true;
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      capture_pageview: "history_change",
      person_profiles: "identified_only",
    });
  }, []);

  useEffect(() => {
    if (me && process.env.NEXT_PUBLIC_POSTHOG_KEY && data.mode === "supabase")
      posthog.identify(me.id, { name: me.displayName });
  }, [me, data.mode]);

  return (
    <SessionContext.Provider value={{ data, me, loading, refresh, setMe }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <Providers>");
  return ctx;
}

export function track(event: string, props?: Record<string, unknown>) {
  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) posthog.capture(event, props);
}
