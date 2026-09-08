/**
 * Public build-time configuration for Firebase patient login (ADR-0010 §3).
 *
 * OIDC providers are deliberately *not* here. They are described by the
 * backend at runtime (`@/Utils/auth/oidcProviders`), because a build that
 * declared its own could advertise a method the backend does not have.
 *
 * Firebase stays build-time because its web configuration genuinely is public
 * build input rather than deployment state. An incomplete configuration is
 * treated as disabled rather than as an error, so a half-configured build
 * hides the method instead of offering a choice that cannot succeed.
 */

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

export interface FirebaseAuthConfig {
  enabled: boolean;
  web: FirebaseWebConfig | null;
  /** E.164 calling codes SMS may be delivered to. Mirrors the backend policy. */
  smsCountryCodes: readonly string[];
  /** Absolute URL Firebase returns the email link to. */
  emailLinkCallbackUrl: string;
}

const trimmed = (value: string | undefined) => (value ?? "").trim();

export const booleanFlag = (value: string | undefined): boolean =>
  trimmed(value).toLowerCase() === "true";

export const parseCallingCodes = (value: string | undefined): string[] =>
  trimmed(value)
    .split(",")
    .map((code) => code.trim())
    .filter((code) => /^\+\d{1,3}$/.test(code));

/**
 * Same-origin, https (or localhost http), no credentials, no fragment.
 * A redirect URI is compared byte-for-byte by the backend, so a malformed one
 * is a silent dead end; refusing it here turns it into a hidden method.
 */
export const isSafeCallbackUrl = (value: string | undefined): boolean => {
  const candidate = trimmed(value);
  if (!candidate) return false;
  try {
    const url = new URL(candidate);
    const isLocalHttp =
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return (
      (url.protocol === "https:" || isLocalHttp) &&
      !url.username &&
      !url.password &&
      !url.hash
    );
  } catch {
    return false;
  }
};

export interface ExternalAuthEnv {
  REACT_FIREBASE_AUTH_ENABLED?: string;
  REACT_FIREBASE_API_KEY?: string;
  REACT_FIREBASE_AUTH_DOMAIN?: string;
  REACT_FIREBASE_PROJECT_ID?: string;
  REACT_FIREBASE_APP_ID?: string;
  REACT_FIREBASE_SMS_COUNTRY_CODES?: string;
  REACT_FIREBASE_EMAIL_LINK_CALLBACK_URL?: string;
}

export const DEFAULT_SMS_COUNTRY_CODES = ["+52"] as const;

export function buildFirebaseAuthConfig(
  env: ExternalAuthEnv,
): FirebaseAuthConfig {
  const web: FirebaseWebConfig = {
    apiKey: trimmed(env.REACT_FIREBASE_API_KEY),
    authDomain: trimmed(env.REACT_FIREBASE_AUTH_DOMAIN),
    projectId: trimmed(env.REACT_FIREBASE_PROJECT_ID),
    appId: trimmed(env.REACT_FIREBASE_APP_ID),
  };
  const isComplete = Object.values(web).every(Boolean);
  const emailLinkCallbackUrl = trimmed(
    env.REACT_FIREBASE_EMAIL_LINK_CALLBACK_URL,
  );
  const smsCountryCodes = parseCallingCodes(
    env.REACT_FIREBASE_SMS_COUNTRY_CODES,
  );

  return {
    enabled: booleanFlag(env.REACT_FIREBASE_AUTH_ENABLED) && isComplete,
    web: isComplete ? web : null,
    smsCountryCodes: smsCountryCodes.length
      ? smsCountryCodes
      : [...DEFAULT_SMS_COUNTRY_CODES],
    emailLinkCallbackUrl: isSafeCallbackUrl(emailLinkCallbackUrl)
      ? emailLinkCallbackUrl
      : "",
  };
}
