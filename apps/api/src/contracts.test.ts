import test from "node:test";
import assert from "node:assert/strict";
import { createPageSchema, registerSchema } from "@notionlike/contracts";

test("registration rejects weak passwords", () => {
  assert.equal(registerSchema.safeParse({ name: "A", email: "a@example.com", password: "short" }).success, false);
});

test("page creation accepts offline client UUIDs", () => {
  assert.equal(createPageSchema.safeParse({ workspaceId: "e4eaaaf2-d142-11e1-b3e4-080027620cdd", clientId: "9b2fb2a2-d142-11e1-b3e4-080027620cdd" }).success, true);
});
