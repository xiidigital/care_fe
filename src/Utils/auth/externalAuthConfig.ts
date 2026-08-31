/**
 * Public build-time configuration for the optional login providers (ADR-0010).
 *
 * Every value here is a public identifier: Firebase web configuration and OIDC
 * client IDs are designed to ship in a bundle. Keycloak client secrets are
 * backend-only and must never reach this file.
 *
 * A provider whose configuration is incomplete is treated as disabled rather
 * than as an error, so a half-configured build hides the method instead of
 * offering a choice that cannot succeed.
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

export interface KeycloakClientConfig {
  clientId: string;
  redirectUri: string;
}

export interface KeycloakConfig {
  enabled: boolean;
  issuerUrl: string;
  workforce: KeycloakClientConfig | null;
  patient: KeycloakClientConfig | null;
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

export const isSafeIssuerUrl = (value: string | undefined): boolean => {
  const candidate = trimmed(value);
  if (!isSafeCallbackUrl(candidate)) return false;
  const url = new URL(candidate);
  return !url.search;
};

export interface ExternalAuthEnv {
  REACT_FIREBASE_AUTH_ENABLED?: string;
  REACT_FIREBASE_API_KEY?: string;
  REACT_FIREBASE_AUTH_DOMAIN?: string;
  REACT_FIREBASE_PROJECT_ID?: string;
  REACT_FIREBASE_APP_ID?: string;
  REACT_FIREBASE_SMS_COUNTRY_CODES?: string;
  REACT_FIREBASE_EMAIL_LINK_CALLBACK_URL?: string;
  REACT_KEYCLOAK_ENABLED?: string;
  REACT_KEYCLOAK_ISSUER_URL?: string;
  REACT_KEYCLOAK_WORKFORCE_CLIENT_ID?: string;
  REACT_KEYCLOAK_PATIENT_CLIENT_ID?: string;
  REACT_KEYCLOAK_WORKFORCE_REDIRECT_URI?: string;
  REACT_KEYCLOAK_PATIENT_REDIRECT_URI?: string;
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

export function buildKeycloakConfig(env: ExternalAuthEnv): KeycloakConfig {
  const issuerUrl = trimmed(env.REACT_KEYCLOAK_ISSUER_URL);
  const workforceRedirect = trimmed(env.REACT_KEYCLOAK_WORKFORCE_REDIRECT_URI);
  const patientRedirect = trimmed(env.REACT_KEYCLOAK_PATIENT_REDIRECT_URI);
  const workforceClientId = trimmed(env.REACT_KEYCLOAK_WORKFORCE_CLIENT_ID);
  const patientClientId = trimmed(env.REACT_KEYCLOAK_PATIENT_CLIENT_ID);

  const workforce =
    workforceClientId && isSafeCallbackUrl(workforceRedirect)
      ? { clientId: workforceClientId, redirectUri: workforceRedirect }
      : null;
  const patient =
    patientClientId && isSafeCallbackUrl(patientRedirect)
      ? { clientId: patientClientId, redirectUri: patientRedirect }
      : null;

  const enabled =
    booleanFlag(env.REACT_KEYCLOAK_ENABLED) && isSafeIssuerUrl(issuerUrl);

  return {
    enabled,
    issuerUrl: enabled ? issuerUrl.replace(/\/$/, "") : "",
    workforce: enabled ? workforce : null,
    patient: enabled ? patient : null,
  };
}

/** A principal may use Keycloak only when its own client is fully configured. */
export const isKeycloakAvailableFor = (
  config: KeycloakConfig,
  principal: "workforce" | "patient",
): boolean => config.enabled && config[principal] !== null;
