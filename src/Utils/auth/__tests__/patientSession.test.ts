import assert from "node:assert/strict";
import { test } from "node:test";

import {
  maskedContact,
  parsePatientSession,
  sessionIdentityKey,
} from "@/Utils/auth/patientSession";

const CREATED_AT = "2026-08-31T10:00:00.000Z";

const stored = (value: unknown) => JSON.stringify(value);

// ---------------------------------------------------------------------------
// Backwards compatibility with pre-ADR-0010 sessions
// ---------------------------------------------------------------------------

test("a legacy phone-only session is still accepted and marked as OTP", () => {
  const session = parsePatientSession(
    stored({
      token: "care-token",
      phoneNumber: "+5215555555555",
      createdAt: CREATED_AT,
    }),
  );

  assert.deepEqual(session, {
    token: "care-token",
    createdAt: CREATED_AT,
    provider: "otp",
    phoneNumber: "+5215555555555",
  });
});

test("an unknown provider value falls back to otp rather than failing", () => {
  const session = parsePatientSession(
    stored({
      token: "t",
      phoneNumber: "+5215555555555",
      createdAt: CREATED_AT,
      provider: "myspace",
    }),
  );

  assert.equal(session?.provider, "otp");
});

// ---------------------------------------------------------------------------
// The new identity shapes
// ---------------------------------------------------------------------------

test("an email session needs no phone number", () => {
  const session = parsePatientSession(
    stored({
      token: "t",
      email: "Patient@Example.COM",
      createdAt: CREATED_AT,
      provider: "firebase",
    }),
  );

  assert.equal(session?.email, "patient@example.com");
  assert.equal(session?.phoneNumber, undefined);
  assert.equal(session?.provider, "firebase");
});

test("an oidc session identifies one exact patient", () => {
  const session = parsePatientSession(
    stored({
      token: "t",
      patientId: "550e8400-e29b-41d4-a716-446655440000",
      createdAt: CREATED_AT,
      provider: "oidc",
    }),
  );

  assert.equal(session?.patientId, "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(session?.provider, "oidc");
});

// ---------------------------------------------------------------------------
// Malformed or obsolete state is invalidated, never repaired
// ---------------------------------------------------------------------------

test("a session with no identity at all is refused", () => {
  assert.equal(
    parsePatientSession(stored({ token: "t", createdAt: CREATED_AT })),
    null,
  );
});

test("the empty phone number that used to be faked is refused", () => {
  assert.equal(
    parsePatientSession(
      stored({ token: "t", phoneNumber: "", createdAt: CREATED_AT }),
    ),
    null,
  );
});

test("a session without a token is refused", () => {
  assert.equal(
    parsePatientSession(
      stored({ phoneNumber: "+52155", createdAt: CREATED_AT }),
    ),
    null,
  );
});

test("an unparseable or empty entry is refused", () => {
  assert.equal(parsePatientSession(null), null);
  assert.equal(parsePatientSession(""), null);
  assert.equal(parsePatientSession("{"), null);
  assert.equal(parsePatientSession("null"), null);
  assert.equal(parsePatientSession('"a string"'), null);
  assert.equal(parsePatientSession("{}"), null);
});

test("a session with an unusable timestamp is refused", () => {
  assert.equal(
    parsePatientSession(
      stored({ token: "t", phoneNumber: "+52155", createdAt: "not a date" }),
    ),
    null,
  );
});

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

test("a phone number is never displayed in full", () => {
  const session = parsePatientSession(
    stored({
      token: "t",
      phoneNumber: "+5215555551234",
      createdAt: CREATED_AT,
    }),
  )!;

  const masked = maskedContact(session);
  assert.equal(masked.includes("+5215555551234"), false);
  assert.equal(masked.endsWith("1234"), true);
});

test("an email local part is masked but its domain stays legible", () => {
  const session = parsePatientSession(
    stored({
      token: "t",
      email: "patient@example.com",
      createdAt: CREATED_AT,
      provider: "firebase",
    }),
  )!;

  const masked = maskedContact(session);
  assert.equal(masked.includes("patient@"), false);
  assert.equal(masked.endsWith("@example.com"), true);
  assert.equal(masked.startsWith("p"), true);
});

test("an oidc session displays no contact at all", () => {
  const session = parsePatientSession(
    stored({
      token: "t",
      patientId: "abc",
      createdAt: CREATED_AT,
      provider: "oidc",
    }),
  )!;

  assert.equal(maskedContact(session), "");
});

test("the cache key distinguishes identities that share no phone number", () => {
  const email = parsePatientSession(
    stored({ token: "t1", email: "a@b.com", createdAt: CREATED_AT }),
  )!;
  const other = parsePatientSession(
    stored({ token: "t2", email: "c@d.com", createdAt: CREATED_AT }),
  )!;

  assert.notEqual(sessionIdentityKey(email), sessionIdentityKey(other));
  assert.equal(sessionIdentityKey(email), "a@b.com");
});

test("a resolved patient id wins over any other identifier in the key", () => {
  const session = parsePatientSession(
    stored({
      token: "t",
      patientId: "pid",
      email: "a@b.com",
      phoneNumber: "+52155",
      createdAt: CREATED_AT,
    }),
  )!;

  assert.equal(sessionIdentityKey(session), "pid");
});
