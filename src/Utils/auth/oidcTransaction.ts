/**
 * Browser side of the Keycloak Authorization Code + PKCE flow (ADR-0010 §6).
 *
 * Everything here is short-lived, single-use transaction material. It is kept
 * in `sessionStorage` — not `localStorage` — so it dies with the tab, and it is
 * removed on the first read whether the callback succeeds or fails. None of it
 * is ever logged.
 */

export type KeycloakPrincipal = "workforce" | "patient";

export interface OidcTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  principal: KeycloakPrincipal;
  /** Same-origin path to land on after a successful exchange. */
  destination: string;
  createdAt: number;
}

export interface StartedAuthorization {
  authorizationUrl: string;
  transaction: OidcTransaction;
}

/** A login round trip that takes longer than this is not worth completing. */
export const TRANSACTION_TTL_MS = 10 * 60 * 1000;

const STORAGE_KEY = "care_oidc_transaction";

const VERIFIER_BYTES = 64;
const STATE_BYTES = 32;
const NONCE_BYTES = 32;

const base64UrlEncode = (bytes: Uint8Array): string => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const randomBase64Url = (byteLength: number, crypto: Crypto): string =>
  base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));

export const createCodeVerifier = (crypto: Crypto): string =>
  randomBase64Url(VERIFIER_BYTES, crypto).slice(0, 128);

export const createState = (crypto: Crypto): string =>
  randomBase64Url(STATE_BYTES, crypto);

export const createNonce = (crypto: Crypto): string =>
  randomBase64Url(NONCE_BYTES, crypto);

export async function createCodeChallenge(
  codeVerifier: string,
  crypto: Crypto,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Only a same-origin path survives. An absolute or cross-origin destination is
 * discarded rather than corrected, so a crafted link cannot use the callback as
 * an open redirect.
 */
export function safeDestination(
  candidate: string | null | undefined,
  fallback: string,
  origin: string,
): string {
  if (!candidate) return fallback;
  try {
    const url = new URL(candidate, origin);
    if (url.origin !== origin) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

export function buildAuthorizationUrl(params: {
  issuerUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const url = new URL(
    `${params.issuerUrl.replace(/\/$/, "")}/protocol/openid-connect/auth`,
  );
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    scope: "openid",
    state: params.state,
    nonce: params.nonce,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export async function startAuthorization(options: {
  issuerUrl: string;
  clientId: string;
  redirectUri: string;
  principal: KeycloakPrincipal;
  destination: string;
  crypto: Crypto;
  now?: () => number;
}): Promise<StartedAuthorization> {
  const { crypto } = options;
  const codeVerifier = createCodeVerifier(crypto);
  const transaction: OidcTransaction = {
    state: createState(crypto),
    nonce: createNonce(crypto),
    codeVerifier,
    redirectUri: options.redirectUri,
    principal: options.principal,
    destination: options.destination,
    createdAt: (options.now ?? Date.now)(),
  };

  return {
    authorizationUrl: buildAuthorizationUrl({
      issuerUrl: options.issuerUrl,
      clientId: options.clientId,
      redirectUri: options.redirectUri,
      state: transaction.state,
      nonce: transaction.nonce,
      codeChallenge: await createCodeChallenge(codeVerifier, crypto),
    }),
    transaction,
  };
}

export function saveTransaction(
  transaction: OidcTransaction,
  storage: Storage,
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(transaction));
}

/** Reads and removes in one step: a transaction is usable exactly once. */
export function takeTransaction(storage: Storage): OidcTransaction | null {
  const raw = storage.getItem(STORAGE_KEY);
  storage.removeItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<OidcTransaction>;
    const isComplete =
      typeof parsed.state === "string" &&
      typeof parsed.nonce === "string" &&
      typeof parsed.codeVerifier === "string" &&
      typeof parsed.redirectUri === "string" &&
      typeof parsed.destination === "string" &&
      typeof parsed.createdAt === "number" &&
      (parsed.principal === "workforce" || parsed.principal === "patient");
    return isComplete ? (parsed as OidcTransaction) : null;
  } catch {
    return null;
  }
}

export type CallbackFailure =
  | "provider_error"
  | "missing_code"
  | "no_transaction"
  | "state_mismatch"
  | "principal_mismatch"
  | "expired";

export type CallbackResolution =
  | { ok: true; transaction: OidcTransaction; code: string }
  | { ok: false; reason: CallbackFailure };

/**
 * Validate a callback before anything is sent to CARE. State is compared first;
 * a mismatch means the response does not belong to this browser's request.
 */
export function resolveCallback(options: {
  search: string;
  principal: KeycloakPrincipal;
  storage: Storage;
  now?: () => number;
}): CallbackResolution {
  const params = new URLSearchParams(options.search);
  const transaction = takeTransaction(options.storage);

  if (params.get("error")) return { ok: false, reason: "provider_error" };
  if (!transaction) return { ok: false, reason: "no_transaction" };

  const state = params.get("state");
  if (!state || state !== transaction.state) {
    return { ok: false, reason: "state_mismatch" };
  }
  if (transaction.principal !== options.principal) {
    return { ok: false, reason: "principal_mismatch" };
  }
  if (
    (options.now ?? Date.now)() - transaction.createdAt >
    TRANSACTION_TTL_MS
  ) {
    return { ok: false, reason: "expired" };
  }

  const code = params.get("code");
  if (!code) return { ok: false, reason: "missing_code" };

  return { ok: true, transaction, code };
}
