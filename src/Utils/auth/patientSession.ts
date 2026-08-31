/**
 * The patient session, generalized past the phone-only assumption (ADR-0010).
 *
 * A patient token used to imply a verified phone number, and the stored session
 * recorded it as a required field. Firebase email-link and Keycloak patients
 * have no phone number at all, so the session now records *which* identity was
 * proven and displays whatever is actually known.
 *
 * Sessions written by earlier builds are still valid and are migrated on read.
 * Anything that cannot be understood is discarded rather than repaired, so a
 * corrupt entry logs the patient out instead of half-authenticating them.
 */

export type PatientAuthProvider = "otp" | "firebase" | "keycloak";

export interface PatientSession {
  token: string;
  createdAt: string;
  provider: PatientAuthProvider;
  /** Present for OTP and Firebase-SMS identities only. */
  phoneNumber?: string;
  /** Present for Firebase email-link identities only. */
  email?: string;
  /** Present for Keycloak identities, which resolve to one exact patient. */
  patientId?: string;
}

const PROVIDERS: readonly PatientAuthProvider[] = [
  "otp",
  "firebase",
  "keycloak",
];

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/**
 * Accept a stored session only if it is complete and still identifies someone.
 * A session with a token but no identity at all is the shape that used to be
 * faked with an empty phone number; it is now refused.
 */
export function parsePatientSession(raw: string | null): PatientSession | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const candidate = parsed as Record<string, unknown>;
  if (!isNonEmptyString(candidate.token)) return null;
  if (!isNonEmptyString(candidate.createdAt)) return null;
  if (Number.isNaN(Date.parse(candidate.createdAt))) return null;

  const phoneNumber = isNonEmptyString(candidate.phoneNumber)
    ? candidate.phoneNumber
    : undefined;
  const email = isNonEmptyString(candidate.email)
    ? candidate.email.trim().toLowerCase()
    : undefined;
  const patientId = isNonEmptyString(candidate.patientId)
    ? candidate.patientId
    : undefined;

  if (!phoneNumber && !email && !patientId) return null;

  // A session written before ADR-0010 carries no provider and always had a
  // phone number, so it is an OTP session by construction.
  const provider = PROVIDERS.includes(candidate.provider as PatientAuthProvider)
    ? (candidate.provider as PatientAuthProvider)
    : "otp";

  return {
    token: candidate.token,
    createdAt: candidate.createdAt,
    provider,
    ...(phoneNumber ? { phoneNumber } : {}),
    ...(email ? { email } : {}),
    ...(patientId ? { patientId } : {}),
  };
}

/** Mask a contact for display. Never render a full phone number or address. */
export function maskedContact(session: PatientSession): string {
  if (session.phoneNumber) {
    return `••• ${session.phoneNumber.slice(-4)}`;
  }
  if (session.email) {
    const [local, domain] = session.email.split("@");
    if (!domain) return "•••";
    const head = local.slice(0, 1);
    return `${head}${"•".repeat(Math.max(local.length - 1, 1))}@${domain}`;
  }
  return "";
}

/**
 * The cache key that used to be the phone number. Keying on the phone number
 * meant an email or Keycloak patient shared one cache bucket with every other
 * such patient.
 */
export function sessionIdentityKey(session: PatientSession): string {
  return (
    session.patientId ?? session.email ?? session.phoneNumber ?? session.token
  );
}

/**
 * Read the CARE patient token's own claims, for display and cache keying only.
 *
 * This is *not* a security decision. The token is verified by the backend on
 * every request; decoding it here only tells the UI which identity CARE
 * actually granted, so a Keycloak or email session can be labelled and cached
 * correctly instead of being given a fabricated phone number. Nothing read here
 * is ever trusted for authorization.
 */
export interface CareTokenClaims {
  phone_number?: string;
  email?: string;
  patient_id?: string;
  auth_provider?: string;
}

export function readCareTokenClaims(token: string): CareTokenClaims | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
    const parsed: unknown = JSON.parse(decoded);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as CareTokenClaims;
  } catch {
    return null;
  }
}

/**
 * Build the stored session from what CARE actually issued, falling back to the
 * identity the browser used when the token carries nothing readable.
 */
export function sessionFromCareToken(
  token: string,
  fallback: {
    provider: PatientAuthProvider;
    phoneNumber?: string;
    email?: string;
  },
  createdAt: string = new Date().toISOString(),
): PatientSession | null {
  const claims = readCareTokenClaims(token) ?? {};
  const provider = PROVIDERS.includes(
    claims.auth_provider as PatientAuthProvider,
  )
    ? (claims.auth_provider as PatientAuthProvider)
    : fallback.provider;

  return parsePatientSession(
    JSON.stringify({
      token,
      createdAt,
      provider,
      phoneNumber: claims.phone_number ?? fallback.phoneNumber,
      email: claims.email ?? fallback.email,
      patientId: claims.patient_id,
    }),
  );
}
