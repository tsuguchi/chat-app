"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Find an existing DM whose member set is exactly { current user, ...otherUserIds }
 * or create a new one. Reuses 1-on-1 DMs so opening "DM with Alice" twice
 * lands on the same channel.
 */
export async function findOrCreateDirectMessage(otherUserIds: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const cleanOthers = Array.from(new Set(otherUserIds.filter((id) => id && id !== user.id)));
  if (cleanOthers.length === 0) {
    redirect("/dm/new?error=no_user");
  }

  const memberIds = [user.id, ...cleanOthers].sort();
  const type = memberIds.length === 2 ? "dm" : "group_dm";

  // Find existing DM with the same exact member set.
  const { data: myDmMemberships } = await supabase
    .from("channel_members")
    .select("channel:channels!inner(id, type)")
    .eq("user_id", user.id);

  const candidateIds: string[] = (myDmMemberships ?? [])
    .map((r) => r.channel as unknown as { id: string; type: string })
    .filter((c) => c.type === type)
    .map((c) => c.id);

  for (const channelId of candidateIds) {
    const { data: members } = await supabase
      .from("channel_members")
      .select("user_id")
      .eq("channel_id", channelId);
    const ids = (members ?? []).map((m) => m.user_id).sort();
    if (ids.length === memberIds.length && ids.every((id, i) => id === memberIds[i])) {
      redirect(`/channels/${channelId}`);
    }
  }

  // Create new DM channel; trigger auto-adds the creator as owner.
  const { data: newChannel, error: insertChannelErr } = await supabase
    .from("channels")
    .insert({ type, name: null, created_by: user.id })
    .select("id")
    .single();

  if (insertChannelErr) {
    redirect(`/dm/new?error=${encodeURIComponent(insertChannelErr.message)}`);
  }

  // Add the other participants. The creator (owner) is already in
  // channel_members via the on_channel_created trigger, which satisfies
  // the "owner can invite" branch of channel_members_insert RLS.
  const { error: insertMembersErr } = await supabase.from("channel_members").insert(
    cleanOthers.map((uid) => ({
      channel_id: newChannel.id,
      user_id: uid,
      role: "member" as const,
    })),
  );

  if (insertMembersErr) {
    redirect(`/dm/new?error=${encodeURIComponent(insertMembersErr.message)}`);
  }

  revalidatePath("/", "layout");
  redirect(`/channels/${newChannel.id}`);
}
