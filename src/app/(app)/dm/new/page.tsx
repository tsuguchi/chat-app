import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserPicker, type PickableUser } from "./user-picker";

type SearchParams = Promise<{ error?: string }>;

const ERROR_LABELS: Record<string, string> = {
  no_user: "ユーザーを 1 人以上選択してください。",
};

export default async function NewDmPage({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams;
  const errorLabel = error ? (ERROR_LABELS[error] ?? error) : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, username")
    .neq("id", user.id)
    .order("display_name", { ascending: true });

  const users = (profiles ?? []) as PickableUser[];

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">新規 DM</h1>
        <p className="mt-1 text-sm text-gray-600">
          DM したい相手を選んでください。複数選ぶとグループ DM になります。
        </p>
      </header>

      {errorLabel && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-800">
          {errorLabel}
        </div>
      )}

      <UserPicker users={users} />
    </div>
  );
}
