"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createChannel(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const typeInput = String(formData.get("type") ?? "");
  const type = typeInput === "private" ? "private" : "public";

  if (!name) {
    redirect("/channels/new?error=missing_name");
  }
  if (name.length > 64) {
    redirect("/channels/new?error=name_too_long");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("channels")
    .insert({
      type,
      name,
      description: description || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/channels/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect(`/channels/${data.id}`);
}
