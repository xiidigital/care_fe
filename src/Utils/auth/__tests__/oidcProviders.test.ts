import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isSafeHttpsUrl,
  isUsableProvider,
  providersFor,
} from "@/Utils/auth/oidcProviders";
import type { OidcProviderDescription } from "@/types/auth/externalAuthApi";

const provider = (
  overrides: Partial<OidcProviderDescription> = {},
): OidcProviderDescription => ({
  id: "clinic-sso",
  display_name: "Clinic SSO",
  principal_type: "workforce",
  issuer: "https://identity.example/realms/care",
  client_id: "care-workforce",
  scopes: ["openid"],
  authorization_endpoint: "https://identity.example/realms/care/authorize",
  redirect_uri: "https://care.example/auth/oidc/workforce/callback",
  ...overrides,
});

// ---------------------------------------------------------------------------
// The browser is about to be sent to these URLs
// ---------------------------------------------------------------------------

test("https is accepted", () => {
  assert.equal(isSafeHttpsUrl("https://identity.example/authorize"), true);
});

test("http is accepted on loopback only, for a local test issuer", () => {
  assert.equal(isSafeHttpsUrl("http://localhost:8081/authorize"), true);
  assert.equal(isSafeHttpsUrl("http://127.0.0.1:8081/authorize"), true);
  assert.equal(isSafeHttpsUrl("http://identity.example/authorize"), false);
});

test("a non-http scheme is refused", () => {
  assert.equal(isSafeHttpsUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpsUrl("data:text/html,<script>"), false);
});

test("credentials and fragments are refused", () => {
  assert.equal(isSafeHttpsUrl("https://u:p@identity.example/a"), false);
  assert.equal(isSafeHttpsUrl("https://identity.example/a#frag"), false);
});

test("an unparseable or empty value is refused", () => {
  assert.equal(isSafeHttpsUrl(""), false);
  assert.equal(isSafeHttpsUrl(undefined), false);
  assert.equal(isSafeHttpsUrl("not a url"), false);
});

// ---------------------------------------------------------------------------
// An incomplete provider is hidden, never offered
// ---------------------------------------------------------------------------

test("a complete provider is usable", () => {
  assert.equal(isUsableProvider(provider()), true);
});

test("a provider missing anything the browser needs is hidden", () => {
  const cases: Partial<OidcProviderDescription>[] = [
    { id: "" },
    { display_name: "" },
    { client_id: "" },
    { authorization_endpoint: "" },
    { redirect_uri: "" },
  ];

  for (const overrides of cases) {
    assert.equal(isUsableProvider(provider(overrides)), false);
  }
});

test("a provider whose endpoints are unsafe is hidden rather than reported", () => {
  // A button that redirects nowhere useful is worse than no button.
  assert.equal(
    isUsableProvider(
      provider({ authorization_endpoint: "http://identity.example/a" }),
    ),
    false,
  );
});

// ---------------------------------------------------------------------------
// A provider serves exactly one principal type
// ---------------------------------------------------------------------------

test("providers are partitioned by principal type", () => {
  const list = [
    provider({ id: "w", principal_type: "workforce" }),
    provider({ id: "p", principal_type: "patient" }),
  ];

  assert.deepEqual(
    providersFor(list, "workforce").map((p) => p.id),
    ["w"],
  );
  assert.deepEqual(
    providersFor(list, "patient").map((p) => p.id),
    ["p"],
  );
});

test("an unusable provider is filtered out of both lists", () => {
  const list = [provider({ redirect_uri: "javascript:alert(1)" })];

  assert.deepEqual(providersFor(list, "workforce"), []);
  assert.deepEqual(providersFor(list, "patient"), []);
});

test("configuration order is preserved", () => {
  const list = [
    provider({ id: "b" }),
    provider({ id: "a" }),
    provider({ id: "c" }),
  ];

  assert.deepEqual(
    providersFor(list, "workforce").map((p) => p.id),
    ["b", "a", "c"],
  );
});
