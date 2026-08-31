import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { beforeEach, test } from "node:test";

import {
  TRANSACTION_TTL_MS,
  buildAuthorizationUrl,
  createCodeChallenge,
  createCodeVerifier,
  createNonce,
  createState,
  resolveCallback,
  safeDestination,
  saveTransaction,
  startAuthorization,
  takeTransaction,
} from "@/Utils/auth/oidcTransaction";

const crypto = webcrypto as unknown as Crypto;

class MemoryStorage implements Storage {
  private entries = new Map<string, string>();
  get length() {
    return this.entries.size;
  }
  clear() {
    this.entries.clear();
  }
  getItem(key: string) {
    return this.entries.get(key) ?? null;
  }
  key(index: number) {
    return [...this.entries.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.entries.delete(key);
  }
  setItem(key: string, value: string) {
    this.entries.set(key, value);
  }
}

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
});

const ORIGIN = "https://care.example";
const REDIRECT = "https://care.example/auth/keycloak/patient/callback";

const start = () =>
  startAuthorization({
    issuerUrl: "https://identity.example/realms/care",
    clientId: "care-patient",
    redirectUri: REDIRECT,
    principal: "patient",
    destination: "/patient/home",
    crypto,
    now: () => 1_000,
  });

// ---------------------------------------------------------------------------
// PKCE material
// ---------------------------------------------------------------------------

test("the code verifier satisfies RFC 7636 length and alphabet", () => {
  for (let i = 0; i < 20; i++) {
    const verifier = createCodeVerifier(crypto);
    assert.ok(verifier.length >= 43 && verifier.length <= 128);
    assert.match(verifier, /^[A-Za-z0-9\-._~]+$/);
  }
});

test("verifier, state and nonce are unpredictable", () => {
  const verifiers = new Set(
    Array.from({ length: 50 }, () => createCodeVerifier(crypto)),
  );
  const states = new Set(Array.from({ length: 50 }, () => createState(crypto)));
  const nonces = new Set(Array.from({ length: 50 }, () => createNonce(crypto)));

  assert.equal(verifiers.size, 50);
  assert.equal(states.size, 50);
  assert.equal(nonces.size, 50);
});

test("the challenge is the S256 digest of the verifier", async () => {
  const verifier = "a".repeat(64);
  const challenge = await createCodeChallenge(verifier, crypto);

  // Known-answer: base64url(SHA-256("aaa…")) computed independently.
  const expected = Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  assert.equal(challenge, expected);
  assert.notEqual(challenge, verifier);
});

// ---------------------------------------------------------------------------
// Authorization request
// ---------------------------------------------------------------------------

test("the authorization request asks for S256 and carries state and nonce", async () => {
  const { authorizationUrl, transaction } = await start();
  const url = new URL(authorizationUrl);

  assert.equal(url.origin, "https://identity.example");
  assert.equal(url.pathname, "/realms/care/protocol/openid-connect/auth");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "care-patient");
  assert.equal(url.searchParams.get("redirect_uri"), REDIRECT);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), transaction.state);
  assert.equal(url.searchParams.get("nonce"), transaction.nonce);
});

test("the verifier never leaves the browser in the authorization request", async () => {
  const { authorizationUrl, transaction } = await start();

  assert.equal(authorizationUrl.includes(transaction.codeVerifier), false);
});

test("a trailing slash on the issuer does not double up", () => {
  const url = buildAuthorizationUrl({
    issuerUrl: "https://identity.example/realms/care/",
    clientId: "c",
    redirectUri: REDIRECT,
    state: "s",
    nonce: "n",
    codeChallenge: "c",
  });

  assert.equal(url.includes("//protocol"), false);
});

// ---------------------------------------------------------------------------
// Single use
// ---------------------------------------------------------------------------

test("a stored transaction can be taken exactly once", async () => {
  const { transaction } = await start();
  saveTransaction(transaction, storage);

  assert.deepEqual(takeTransaction(storage), transaction);
  assert.equal(takeTransaction(storage), null);
});

test("a malformed stored transaction is discarded, not repaired", () => {
  storage.setItem("care_oidc_transaction", "{not json");
  assert.equal(takeTransaction(storage), null);

  storage.setItem("care_oidc_transaction", JSON.stringify({ state: "s" }));
  assert.equal(takeTransaction(storage), null);
});

// ---------------------------------------------------------------------------
// Callback validation — every failure closes
// ---------------------------------------------------------------------------

const callbackFor = async (
  overrides: {
    search?: string;
    principal?: "workforce" | "patient";
    now?: number;
  } = {},
) => {
  const { transaction } = await start();
  saveTransaction(transaction, storage);
  return resolveCallback({
    search:
      overrides.search ??
      `?code=auth-code&state=${encodeURIComponent(transaction.state)}`,
    principal: overrides.principal ?? "patient",
    storage,
    now: () => overrides.now ?? 2_000,
  });
};

test("a matching callback resolves and yields the code", async () => {
  const result = await callbackFor();

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.code, "auth-code");
});

test("a mismatched state is refused", async () => {
  const result = await callbackFor({ search: "?code=auth-code&state=forged" });

  assert.deepEqual(result, { ok: false, reason: "state_mismatch" });
});

test("a missing state is refused", async () => {
  const result = await callbackFor({ search: "?code=auth-code" });

  assert.deepEqual(result, { ok: false, reason: "state_mismatch" });
});

test("a provider error is refused before anything else", async () => {
  const result = await callbackFor({ search: "?error=access_denied" });

  assert.deepEqual(result, { ok: false, reason: "provider_error" });
});

test("a callback with no stored transaction is refused", () => {
  const result = resolveCallback({
    search: "?code=auth-code&state=whatever",
    principal: "patient",
    storage,
  });

  assert.deepEqual(result, { ok: false, reason: "no_transaction" });
});

test("a patient transaction cannot be completed on the workforce callback", async () => {
  const result = await callbackFor({ principal: "workforce" });

  assert.deepEqual(result, { ok: false, reason: "principal_mismatch" });
});

test("a stale transaction is refused", async () => {
  const result = await callbackFor({ now: 1_000 + TRANSACTION_TTL_MS + 1 });

  assert.deepEqual(result, { ok: false, reason: "expired" });
});

test("a callback without a code is refused", async () => {
  const { transaction } = await start();
  saveTransaction(transaction, storage);

  const result = resolveCallback({
    search: `?state=${encodeURIComponent(transaction.state)}`,
    principal: "patient",
    storage,
    now: () => 2_000,
  });

  assert.deepEqual(result, { ok: false, reason: "missing_code" });
});

test("the transaction is cleared even when the callback fails", async () => {
  await callbackFor({ search: "?code=auth-code&state=forged" });

  assert.equal(storage.getItem("care_oidc_transaction"), null);
});

// ---------------------------------------------------------------------------
// Destination handling
// ---------------------------------------------------------------------------

test("only a same-origin destination is retained", () => {
  assert.equal(safeDestination("/patient/home", "/", ORIGIN), "/patient/home");
  assert.equal(
    safeDestination("https://care.example/patient/home?a=1", "/", ORIGIN),
    "/patient/home?a=1",
  );
  assert.equal(safeDestination("https://evil.example/steal", "/", ORIGIN), "/");
  assert.equal(safeDestination("//evil.example/steal", "/", ORIGIN), "/");
  assert.equal(safeDestination(null, "/fallback", ORIGIN), "/fallback");
  assert.equal(safeDestination("", "/fallback", ORIGIN), "/fallback");
});

test("a same-origin destination is reduced to path and query only", () => {
  // Anything that resolves against our own origin is safe to navigate to, but
  // only the path survives -- never a host, credentials or a fragment.
  assert.equal(
    safeDestination("https://care.example/x#tok", "/", ORIGIN),
    "/x",
  );
  assert.equal(
    safeDestination("https://user:pw@evil.example/x", "/", ORIGIN),
    "/",
  );
  assert.equal(safeDestination("::::", "/", ORIGIN).startsWith("/"), true);
});
