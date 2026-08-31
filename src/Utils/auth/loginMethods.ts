/**
 * Which patient login methods a build may offer (ADR-0010 §3).
 *
 * The choices are deliberately flat and provider-shaped only where the patient
 * can tell the difference. `Use another login method` is Keycloak, and it must
 * not name or predict what Keycloak is configured to do internally.
 *
 * Every method is additive and independently switchable. Enabling a provider
 * never removes another one: an installation may run CARE's own phone OTP
 * alone, Firebase alongside it, Keycloak alongside both, or any subset. The
 * only thing that removes the legacy OTP is an operator setting
 * `legacyOtpEnabled` to false.
 */
import {
  FirebaseAuthConfig,
  KeycloakConfig,
  isKeycloakAvailableFor,
} from "@/Utils/auth/externalAuthConfig";

export type PatientLoginMethod = "sms" | "email" | "keycloak" | "legacy_otp";

export interface PatientLoginAvailability {
  methods: PatientLoginMethod[];
  /** True when the patient has a real choice to make. */
  hasChoice: boolean;
}

export function availablePatientLoginMethods(options: {
  firebase: FirebaseAuthConfig;
  keycloak: KeycloakConfig;
  /** Legacy CARE phone OTP stays available while it is still supported. */
  legacyOtpEnabled: boolean;
}): PatientLoginAvailability {
  const methods: PatientLoginMethod[] = [];

  if (options.firebase.enabled) {
    methods.push("sms");
    if (options.firebase.emailLinkCallbackUrl) methods.push("email");
  }
  if (isKeycloakAvailableFor(options.keycloak, "patient")) {
    methods.push("keycloak");
  }
  // The existing CARE phone OTP is never removed by enabling a provider.
  // ADR-0010 §7: legacy paths are disabled and later removed only once their
  // replacements are proven and supported clients have migrated -- that is an
  // operator decision (`legacyOtpEnabled`), not a side effect of switching
  // Firebase on. Firebase is one more way in, not the only way in.
  if (options.legacyOtpEnabled) {
    methods.push("legacy_otp");
  }

  return { methods, hasChoice: methods.length > 1 };
}

export const workforceKeycloakAvailable = (keycloak: KeycloakConfig): boolean =>
  isKeycloakAvailableFor(keycloak, "workforce");
