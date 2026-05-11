"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function joinChannel(channelId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.from("channel_members").insert({
    channel_id: channelId,
    user_id: user.id,
    role: "member",
  });

  // 23505 = unique_violation: already a member, treat as success.
  if (error && error.code !== "23505") {
    redirect(`/channels/browse?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect(`/channels/${channelId}`);
}
