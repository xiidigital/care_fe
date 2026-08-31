import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildFirebaseAuthConfig,
  buildKeycloakConfig,
} from "@/Utils/auth/externalAuthConfig";
import {
  availablePatientLoginMethods,
  workforceKeycloakAvailable,
} from "@/Utils/auth/loginMethods";

const FIREBASE_ON = buildFirebaseAuthConfig({
  REACT_FIREBASE_AUTH_ENABLED: "true",
  REACT_FIREBASE_API_KEY: "k",
  REACT_FIREBASE_AUTH_DOMAIN: "d",
  REACT_FIREBASE_PROJECT_ID: "p",
  REACT_FIREBASE_APP_ID: "a",
  REACT_FIREBASE_EMAIL_LINK_CALLBACK_URL: "https://care.example/auth/email",
});
const FIREBASE_OFF = buildFirebaseAuthConfig({});
const KEYCLOAK_ON = buildKeycloakConfig({
  REACT_KEYCLOAK_ENABLED: "true",
  REACT_KEYCLOAK_ISSUER_URL: "https://identity.example/realms/care",
  REACT_KEYCLOAK_WORKFORCE_CLIENT_ID: "care-workforce",
  REACT_KEYCLOAK_PATIENT_CLIENT_ID: "care-patient",
  REACT_KEYCLOAK_WORKFORCE_REDIRECT_URI: "https://care.example/auth/kc/w",
  REACT_KEYCLOAK_PATIENT_REDIRECT_URI: "https://care.example/auth/kc/p",
});
const KEYCLOAK_OFF = buildKeycloakConfig({});

test("with both providers off, only the legacy OTP path is offered", () => {
  const result = availablePatientLoginMethods({
    firebase: FIREBASE_OFF,
    keycloak: KEYCLOAK_OFF,
    legacyOtpEnabled: true,
  });

  assert.deepEqual(result.methods, ["legacy_otp"]);
  assert.equal(result.hasChoice, false);
});

test("no keycloak choice is rendered while keycloak is dormant", () => {
  const result = availablePatientLoginMethods({
    firebase: FIREBASE_ON,
    keycloak: KEYCLOAK_OFF,
    legacyOtpEnabled: true,
  });

  assert.equal(result.methods.includes("keycloak"), false);
  assert.equal(workforceKeycloakAvailable(KEYCLOAK_OFF), false);
});

test("enabling firebase adds SMS and email without removing the CARE OTP", () => {
  const result = availablePatientLoginMethods({
    firebase: FIREBASE_ON,
    keycloak: KEYCLOAK_OFF,
    legacyOtpEnabled: true,
  });

  // Firebase is one more way in, never a replacement: the existing CARE phone
  // OTP is still offered alongside it.
  assert.deepEqual(result.methods, ["sms", "email", "legacy_otp"]);
  assert.equal(result.hasChoice, true);
});

test("only an operator decision removes the CARE OTP, never a provider", () => {
  const withLegacy = availablePatientLoginMethods({
    firebase: FIREBASE_ON,
    keycloak: KEYCLOAK_ON,
    legacyOtpEnabled: true,
  });
  const withoutLegacy = availablePatientLoginMethods({
    firebase: FIREBASE_ON,
    keycloak: KEYCLOAK_ON,
    legacyOtpEnabled: false,
  });

  assert.equal(withLegacy.methods.includes("legacy_otp"), true);
  assert.equal(withoutLegacy.methods.includes("legacy_otp"), false);
});

test("every combination of providers is independently selectable", () => {
  const combinations: [boolean, boolean, boolean, string[]][] = [
    [false, false, true, ["legacy_otp"]],
    [true, false, true, ["sms", "email", "legacy_otp"]],
    [false, true, true, ["keycloak", "legacy_otp"]],
    [true, true, true, ["sms", "email", "keycloak", "legacy_otp"]],
    [true, false, false, ["sms", "email"]],
    [false, true, false, ["keycloak"]],
    [true, true, false, ["sms", "email", "keycloak"]],
    [false, false, false, []],
  ];

  for (const [firebase, keycloak, legacy, expected] of combinations) {
    assert.deepEqual(
      availablePatientLoginMethods({
        firebase: firebase ? FIREBASE_ON : FIREBASE_OFF,
        keycloak: keycloak ? KEYCLOAK_ON : KEYCLOAK_OFF,
        legacyOtpEnabled: legacy,
      }).methods,
      expected,
      `firebase=${firebase} keycloak=${keycloak} legacy=${legacy}`,
    );
  }
});

test("firebase without an email callback offers SMS only", () => {
  const smsOnly = buildFirebaseAuthConfig({
    REACT_FIREBASE_AUTH_ENABLED: "true",
    REACT_FIREBASE_API_KEY: "k",
    REACT_FIREBASE_AUTH_DOMAIN: "d",
    REACT_FIREBASE_PROJECT_ID: "p",
    REACT_FIREBASE_APP_ID: "a",
  });

  const result = availablePatientLoginMethods({
    firebase: smsOnly,
    keycloak: KEYCLOAK_OFF,
    legacyOtpEnabled: false,
  });

  assert.deepEqual(result.methods, ["sms"]);
});

test("all three provider choices appear when both providers are enabled", () => {
  const result = availablePatientLoginMethods({
    firebase: FIREBASE_ON,
    keycloak: KEYCLOAK_ON,
    legacyOtpEnabled: false,
  });

  assert.deepEqual(result.methods, ["sms", "email", "keycloak"]);
  assert.equal(workforceKeycloakAvailable(KEYCLOAK_ON), true);
});

test("keycloak alone is offered without any firebase configuration", () => {
  const result = availablePatientLoginMethods({
    firebase: FIREBASE_OFF,
    keycloak: KEYCLOAK_ON,
    legacyOtpEnabled: false,
  });

  assert.deepEqual(result.methods, ["keycloak"]);
});

test("a build with nothing configured offers nothing", () => {
  const result = availablePatientLoginMethods({
    firebase: FIREBASE_OFF,
    keycloak: KEYCLOAK_OFF,
    legacyOtpEnabled: false,
  });

  assert.deepEqual(result.methods, []);
  assert.equal(result.hasChoice, false);
});
