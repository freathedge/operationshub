import { describe, expect, it, vi } from "vitest";
import { toErrorResponse } from "@/lib/api/error-response";
import { ForbiddenError, InvalidTransitionError, NotFoundError } from "@/lib/domain/errors";

describe("toErrorResponse", () => {
  it("maps ForbiddenError to 403", async () => {
    const response = toErrorResponse(new ForbiddenError("nope"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "nope" });
  });

  it("maps NotFoundError to 404", async () => {
    const response = toErrorResponse(new NotFoundError("missing"));
    expect(response.status).toBe(404);
  });

  it("maps InvalidTransitionError to 400", async () => {
    const response = toErrorResponse(new InvalidTransitionError("bad transition"));
    expect(response.status).toBe(400);
  });

  it("maps unknown errors to 500 without leaking the message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = toErrorResponse(new Error("db connection string leaked"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });
});
