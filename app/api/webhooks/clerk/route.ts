import { NextResponse, type NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { linkProfileToAuthUser } from "@/lib/domain/profiles";
import { toErrorResponse } from "@/lib/api/error-response";

export async function POST(request: Request) {
  let event;
  try {
    // Next.js invokes Route Handlers with a NextRequest at runtime; `verifyWebhook`
    // only reads headers and the body, both of which are present on the standard
    // Request this handler (and its tests) is typed against.
    event = await verifyWebhook(request as unknown as NextRequest);
  } catch (error) {
    console.error("Clerk webhook verification failed", error);
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  if (event.type === "user.created") {
    const pendingProfileId = event.data.public_metadata?.pendingProfileId;
    if (typeof pendingProfileId === "string") {
      try {
        await linkProfileToAuthUser(pendingProfileId, event.data.id);
      } catch (error) {
        return toErrorResponse(error);
      }
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
