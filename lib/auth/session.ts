import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfileByAuthUserId, type Profile } from "@/lib/domain/profiles";

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return getProfileByAuthUserId(user.id);
}
