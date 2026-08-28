import { NextResponse } from "next/server";
import {
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  UnprocessableRequestError,
} from "@/lib/domain/errors";

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof InvalidTransitionError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof UnprocessableRequestError) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  console.error(error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
