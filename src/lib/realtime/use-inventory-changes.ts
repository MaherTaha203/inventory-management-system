"use client";

import { useEffect, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function useInventoryChanges(onChange: () => void) {
  const callback = useRef(onChange);

  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let client: ReturnType<typeof createSupabaseBrowserClient>;
    try {
      client = createSupabaseBrowserClient();
    } catch {
      return;
    }

    const channel = client
      .channel("inventory-system-changes")
      .on("broadcast", { event: "changed" }, () => callback.current())
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, []);
}
