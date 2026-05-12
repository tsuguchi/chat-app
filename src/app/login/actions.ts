"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Supabase Auth only has email+password; we present this to users as
// username+password by suffixing a non-routable internal domain on the
// way in. The profile keeps the bare username separately.
const SYNTH_EMAIL_DOMAIN = "chat-app.local";

// Username/password rules. The username pattern matches the existing
// CHECK constraint on profiles.username so we fail fast in the client
// instead of getting a 23514 from the trigger.
const USERNAME_RE = /^[A-Za-z0-9_]{1,32}$/;

function synthEmail(username: string): string {
  return `${username.toLowerCase()}@${SYNTH_EMAIL_DOMAIN}`;
}

export async function signIn(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    redirect("/login?error=missing_fields");
  }
  if (!USERNAME_RE.test(username)) {
    redirect("/login?error=invalid_username");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: synthEmail(username),
    password,
  });

  if (error) {
    // Supabase returns "Invalid login credentials" for both wrong username
    // and wrong password, which is the safer behavior anyway.
    redirect(`/login?error=${encodeURIComponent("invalid_credentials")}`);
  }

  redirect("/");
}

export async function signUp(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim() || username;
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    redirect("/signup?error=missing_fields");
  }
  if (!USERNAME_RE.test(username)) {
    redirect("/signup?error=invalid_username");
  }
  if (password.length < 8) {
    redirect("/signup?error=password_too_short");
  }
  if (displayName.length > 64) {
    redirect("/signup?error=display_name_too_long");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: synthEmail(username),
    password,
    options: {
      // Picked up by the on_auth_user_created trigger to populate
      // profiles.username / display_name with the real values instead
      // of the local-part of the synthetic email.
      data: { username, display_name: displayName },
    },
  });

  if (error) {
    // 23505 from the username unique index surfaces as a generic auth
    // error here; we re-map for a clearer UX message.
    const lower = error.message.toLowerCase();
    if (lower.includes("already") || lower.includes("registered")) {
      redirect("/signup?error=username_taken");
    }
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/");
}

