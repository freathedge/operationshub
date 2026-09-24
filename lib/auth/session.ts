import { auth } from "@clerk/nextjs/server";
import { getProfileByAuthUserId, type Profile } from "@/lib/domain/profiles";

export async function getCurrentProfile(): Promise<Profile | null> {
  const { userId } = await auth();
  if (!userId) return null;
  return getProfileByAuthUserId(userId);
}
