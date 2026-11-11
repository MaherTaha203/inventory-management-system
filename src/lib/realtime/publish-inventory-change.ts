import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const INVENTORY_CHANGE_TOPIC = "inventory-system-changes";

export async function publishInventoryChange(): Promise<void> {
  try {
    const client = createSupabaseAdminClient();
    const channel = client.channel(INVENTORY_CHANGE_TOPIC, {
      config: { broadcast: { self: false } },
    });

    await new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        void client.removeChannel(channel);
        resolve();
      };

      const timeout = setTimeout(finish, 2500);
      channel.subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        void channel.send({
          type: "broadcast",
          event: "changed",
          payload: { changed: true },
        }).finally(() => {
          clearTimeout(timeout);
          finish();
        });
      });
    });
  } catch {
    // Database writes remain successful if the optional invalidation event fails.
  }
}
