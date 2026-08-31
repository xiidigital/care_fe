import assert from "node:assert/strict";
import { test } from "node:test";

import {
  readCareTokenClaims,
  sessionFromCareToken,
} from "@/Utils/auth/patientSession";

/** Build an unsigned JWT-shaped string. Only the payload is ever read. */
const tokenWith = (claims: Record<string, unknown>) => {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${encode({ alg: "HS256" })}.${encode(claims)}.signature`;
};

test("a keycloak token yields the resolved patient identity", () => {
  const token = tokenWith({
    patient_id: "550e8400-e29b-41d4-a716-446655440000",
    auth_provider: "keycloak",
  });

  const session = sessionFromCareToken(token, { provider: "keycloak" });

  assert.equal(session?.patientId, "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(session?.provider, "keycloak");
  assert.equal(session?.phoneNumber, undefined);
  assert.equal(session?.email, undefined);
});

test("a firebase email token yields the verified email, not a phone number", () => {
  const token = tokenWith({
    email: "patient@example.com",
    auth_provider: "firebase",
  });

  const session = sessionFromCareToken(token, { provider: "firebase" });

  assert.equal(session?.email, "patient@example.com");
  assert.equal(session?.phoneNumber, undefined);
});

test("the token's own claims win over what the browser believed", () => {
  const token = tokenWith({
    phone_number: "+5215555550000",
    auth_provider: "firebase",
  });

  const session = sessionFromCareToken(token, {
    provider: "otp",
    phoneNumber: "+5215555559999",
  });

  assert.equal(session?.phoneNumber, "+5215555550000");
  assert.equal(session?.provider, "firebase");
});

test("a legacy token with no claims falls back to the browser's identity", () => {
  const token = tokenWith({ token_type: "patient_login" });

  const session = sessionFromCareToken(token, {
    provider: "otp",
    phoneNumber: "+5215555555555",
  });

  assert.equal(session?.phoneNumber, "+5215555555555");
  assert.equal(session?.provider, "otp");
});

test("a token that identifies nobody produces no session", () => {
  const token = tokenWith({ token_type: "patient_login" });

  assert.equal(sessionFromCareToken(token, { provider: "firebase" }), null);
});

test("an unreadable token produces no session rather than a broken one", () => {
  assert.equal(readCareTokenClaims("not-a-jwt"), null);
  assert.equal(readCareTokenClaims(""), null);
  assert.equal(sessionFromCareToken("not-a-jwt", { provider: "otp" }), null);
});

test("a token whose payload is not an object is refused", () => {
  const token = `header.${Buffer.from('"a string"').toString("base64url")}.sig`;

  assert.equal(readCareTokenClaims(token), null);
});

test("the stored session keeps the raw token and nothing else secret", () => {
  const token = tokenWith({ email: "a@b.com", auth_provider: "firebase" });
  const session = sessionFromCareToken(token, { provider: "firebase" });

  assert.deepEqual(Object.keys(session!).sort(), [
    "createdAt",
    "email",
    "provider",
    "token",
  ]);
});
