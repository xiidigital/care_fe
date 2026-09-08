import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildFirebaseAuthConfig,
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
