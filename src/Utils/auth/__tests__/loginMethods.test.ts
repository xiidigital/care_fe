import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFirebaseAuthConfig } from "@/Utils/auth/externalAuthConfig";
import {
  availablePatientLoginMethods,
  workforceProvidersAvailable,
} from "@/Utils/auth/loginMethods";
import { OidcProviderDescription } from "@/types/auth/externalAuthApi";

const FIREBASE_ON = buildFirebaseAuthConfig({
  REACT_FIREBASE_AUTH_ENABLED: "true",
  REACT_FIREBASE_API_KEY: "k",
  REACT_FIREBASE_AUTH_DOMAIN: "d",
  REACT_FIREBASE_PROJECT_ID: "p",
  REACT_FIREBASE_APP_ID: "a",
  REACT_FIREBASE_EMAIL_LINK_CALLBACK_URL: "https://care.example/auth/email",
});
const FIREBASE_OFF = buildFirebaseAuthConfig({});

const provider = (
  overrides: Partial<OidcProviderDescription> = {},
): OidcProviderDescription => ({
  id: "patient-sso",
  display_name: "Patient SSO",
  principal_type: "patient",
  issuer: "https://identity.example/realms/care",
  client_id: "care-patient",
  scopes: ["openid"],
  authorization_endpoint: "https://identity.example/realms/care/authorize",
  redirect_uri: "https://care.example/auth/oidc/patient/callback",
  ...overrides,
});

const kinds = (methods: { kind: string }[]) => methods.map((m) => m.kind);

// ---------------------------------------------------------------------------
// The matrix (ES-11 §10), from the browser's side
// ---------------------------------------------------------------------------

test("row 1: OTP alone, with nothing external configured", () => {
  const { methods, hasChoice } = availablePatientLoginMethods({
    firebase: FIREBASE_OFF,
    providers: [],
    legacyOtpEnabled: true,
  });

  assert.deepEqual(kinds(methods), ["legacy_otp"]);
  assert.equal(hasChoice, false);
});

test("row 2: firebase adds to OTP rather than replacing it", () => {
  const { methods } = availablePatientLoginMethods({
    firebase: FIREBASE_ON,
    providers: [],
    legacyOtpEnabled: true,
  });

  assert.deepEqual(kinds(methods), ["sms", "email", "legacy_otp"]);
});

test("row 4: a patient provider adds to OTP rather than replacing it", () => {
  const { methods } = availablePatientLoginMethods({
    firebase: FIREBASE_OFF,
    providers: [provider()],
    legacyOtpEnabled: true,
  });

  assert.deepEqual(kinds(methods), ["oidc", "legacy_otp"]);
});

test("row 5: every method available at once", () => {
  const { methods, hasChoice } = availablePatientLoginMethods({
    firebase: FIREBASE_ON,
    providers: [provider()],
    legacyOtpEnabled: true,
  });

  assert.deepEqual(kinds(methods), ["sms", "email", "oidc", "legacy_otp"]);
  assert.equal(hasChoice, true);
});

test("row 6: OTP is removed only by the operator's own decision", () => {
  const { methods } = availablePatientLoginMethods({
    firebase: FIREBASE_ON,
    providers: [],
    legacyOtpEnabled: false,
  });

  assert.deepEqual(kinds(methods), ["sms", "email"]);
});

// ---------------------------------------------------------------------------
// Providers are plural, and each one is its own choice
// ---------------------------------------------------------------------------

test("several patient providers each get their own entry", () => {
  const { methods } = availablePatientLoginMethods({
    firebase: FIREBASE_OFF,
    providers: [
      provider({ id: "a", display_name: "Provider A" }),
      provider({ id: "b", display_name: "Provider B" }),
    ],
    legacyOtpEnabled: false,
  });

  assert.deepEqual(kinds(methods), ["oidc", "oidc"]);
  assert.deepEqual(
    methods.map((m) => m.provider?.display_name),
    ["Provider A", "Provider B"],
  );
});

test("a workforce provider is never offered to a patient", () => {
  const { methods } = availablePatientLoginMethods({
    firebase: FIREBASE_OFF,
    providers: [provider({ principal_type: "workforce" })],
    legacyOtpEnabled: true,
  });

  assert.deepEqual(kinds(methods), ["legacy_otp"]);
});

test("a provider with an unusable authorization endpoint is hidden", () => {
  // A button that redirects nowhere is worse than no button.
  const { methods } = availablePatientLoginMethods({
    firebase: FIREBASE_OFF,
    providers: [
      provider({ authorization_endpoint: "http://identity.example/a" }),
    ],
    legacyOtpEnabled: true,
  });

  assert.deepEqual(kinds(methods), ["legacy_otp"]);
});

test("a provider with a cross-scheme redirect uri is hidden", () => {
  const { methods } = availablePatientLoginMethods({
    firebase: FIREBASE_OFF,
    providers: [provider({ redirect_uri: "javascript:alert(1)" })],
    legacyOtpEnabled: true,
  });

  assert.deepEqual(kinds(methods), ["legacy_otp"]);
});

test("workforce availability is answered from the same list", () => {
  assert.equal(workforceProvidersAvailable([]), false);
  assert.equal(workforceProvidersAvailable([provider()]), false);
  assert.equal(
    workforceProvidersAvailable([provider({ principal_type: "workforce" })]),
    true,
  );
});
