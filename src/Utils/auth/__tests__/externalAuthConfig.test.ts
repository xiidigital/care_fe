import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildFirebaseAuthConfig,
  buildKeycloakConfig,
  isKeycloakAvailableFor,
  isSafeCallbackUrl,
  parseCallingCodes,
} from "@/Utils/auth/externalAuthConfig";

const COMPLETE_FIREBASE = {
  REACT_FIREBASE_AUTH_ENABLED: "true",
  REACT_FIREBASE_API_KEY: "public-api-key",
  REACT_FIREBASE_AUTH_DOMAIN: "care-dev.firebaseapp.com",
  REACT_FIREBASE_PROJECT_ID: "care-dev",
  REACT_FIREBASE_APP_ID: "1:2:web:3",
  REACT_FIREBASE_EMAIL_LINK_CALLBACK_URL:
    "https://care.example/auth/firebase/email-callback",
};

const COMPLETE_KEYCLOAK = {
  REACT_KEYCLOAK_ENABLED: "true",
  REACT_KEYCLOAK_ISSUER_URL: "https://identity.example/realms/care",
  REACT_KEYCLOAK_WORKFORCE_CLIENT_ID: "care-workforce",
  REACT_KEYCLOAK_PATIENT_CLIENT_ID: "care-patient",
  REACT_KEYCLOAK_WORKFORCE_REDIRECT_URI:
    "https://care.example/auth/keycloak/workforce/callback",
  REACT_KEYCLOAK_PATIENT_REDIRECT_URI:
    "https://care.example/auth/keycloak/patient/callback",
};

// ---------------------------------------------------------------------------
// Disabled by default
// ---------------------------------------------------------------------------

test("an empty environment disables both providers", () => {
  assert.equal(buildFirebaseAuthConfig({}).enabled, false);
  assert.equal(buildKeycloakConfig({}).enabled, false);
});

test("an unset flag is not enabled even with complete configuration", () => {
  const firebase = buildFirebaseAuthConfig({
    ...COMPLETE_FIREBASE,
    REACT_FIREBASE_AUTH_ENABLED: undefined,
  });
  const keycloak = buildKeycloakConfig({
    ...COMPLETE_KEYCLOAK,
    REACT_KEYCLOAK_ENABLED: undefined,
  });

  assert.equal(firebase.enabled, false);
  assert.equal(keycloak.enabled, false);
  assert.equal(keycloak.workforce, null);
  assert.equal(keycloak.patient, null);
});

test("only the exact string true enables a provider", () => {
  for (const value of ["1", "yes", "TRUE ", "on", ""]) {
    assert.equal(
      buildKeycloakConfig({
        ...COMPLETE_KEYCLOAK,
        REACT_KEYCLOAK_ENABLED: value,
      }).enabled,
      value === "TRUE ",
      `value ${JSON.stringify(value)}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Incomplete configuration fails safe
// ---------------------------------------------------------------------------

test("firebase with a missing web value stays disabled", () => {
  const config = buildFirebaseAuthConfig({
    ...COMPLETE_FIREBASE,
    REACT_FIREBASE_APP_ID: "",
  });

  assert.equal(config.enabled, false);
  assert.equal(config.web, null);
});

test("an unsafe email-link callback is dropped, which hides the email method", () => {
  const config = buildFirebaseAuthConfig({
    ...COMPLETE_FIREBASE,
    REACT_FIREBASE_EMAIL_LINK_CALLBACK_URL: "http://care.example/callback",
  });

  assert.equal(config.enabled, true);
  assert.equal(config.emailLinkCallbackUrl, "");
});

test("keycloak with an insecure issuer stays disabled", () => {
  const config = buildKeycloakConfig({
    ...COMPLETE_KEYCLOAK,
    REACT_KEYCLOAK_ISSUER_URL: "http://identity.example/realms/care",
  });

  assert.equal(config.enabled, false);
});

test("one misconfigured keycloak client does not disable the other", () => {
  const config = buildKeycloakConfig({
    ...COMPLETE_KEYCLOAK,
    REACT_KEYCLOAK_PATIENT_REDIRECT_URI: "not-a-url",
  });

  assert.equal(config.enabled, true);
  assert.equal(isKeycloakAvailableFor(config, "workforce"), true);
  assert.equal(isKeycloakAvailableFor(config, "patient"), false);
});

test("a localhost http callback is allowed for development", () => {
  assert.equal(isSafeCallbackUrl("http://localhost:4000/auth/cb"), true);
  assert.equal(isSafeCallbackUrl("http://care.example/auth/cb"), false);
});

test("a callback carrying credentials or a fragment is refused", () => {
  assert.equal(isSafeCallbackUrl("https://user:pw@care.example/cb"), false);
  assert.equal(isSafeCallbackUrl("https://care.example/cb#token"), false);
});

// ---------------------------------------------------------------------------
// SMS country policy
// ---------------------------------------------------------------------------

test("the sms policy defaults to Mexico", () => {
  assert.deepEqual(buildFirebaseAuthConfig(COMPLETE_FIREBASE).smsCountryCodes, [
    "+52",
  ]);
});

test("the sms policy can be widened by configuration", () => {
  const config = buildFirebaseAuthConfig({
    ...COMPLETE_FIREBASE,
    REACT_FIREBASE_SMS_COUNTRY_CODES: "+52, +1",
  });

  assert.deepEqual(config.smsCountryCodes, ["+52", "+1"]);
});

test("malformed calling codes are discarded rather than trusted", () => {
  assert.deepEqual(parseCallingCodes("52,+,+1,++44,+521234"), ["+1"]);
});

test("a policy of only malformed codes falls back to the default", () => {
  const config = buildFirebaseAuthConfig({
    ...COMPLETE_FIREBASE,
    REACT_FIREBASE_SMS_COUNTRY_CODES: "52,MX",
  });

  assert.deepEqual(config.smsCountryCodes, ["+52"]);
});

test("no keycloak secret can be read out of the public configuration", () => {
  const config = buildKeycloakConfig({
    ...COMPLETE_KEYCLOAK,
  } as Record<string, string>);

  assert.equal(JSON.stringify(config).includes("secret"), false);
});
