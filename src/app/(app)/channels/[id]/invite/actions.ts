"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function inviteMembers(channelId: string, userIds: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const cleanIds = Array.from(new Set(userIds.filter((id) => id && id !== user.id)));
  if (cleanIds.length === 0) {
    redirect(`/channels/${channelId}/invite?error=no_user`);
  }

  // RLS gates this insert: only channel owner/admin or workspace admin may
  // invite. We let the server reject if the caller is not authorized.
  const { error } = await supabase.from("channel_members").insert(
    cleanIds.map((uid) => ({
      channel_id: channelId,
      user_id: uid,
      role: "member" as const,
    })),
  );

  if (error) {
    redirect(`/channels/${channelId}/invite?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect(`/channels/${channelId}`);
}
