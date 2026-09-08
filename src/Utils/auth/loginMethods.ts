/**
 * Which patient login methods a build may offer (ADR-0011 §6).
 *
 * The choices are flat and provider-shaped only where the patient can tell the
 * difference. An OIDC provider appears under the name the operator gave it,
 * and never names or predicts what that provider does internally — password,
 * OTP, passkey and federation are all just "that provider" from here.
 *
 * Every method is additive and independently switchable. Enabling a provider
 * never removes another one: an installation may run CARE's own phone OTP
 * alone, Firebase alongside it, one or more OIDC providers alongside both, or
 * any subset. The only thing that removes the legacy OTP is an operator
 * setting `legacyOtpEnabled` to false, and the backend refuses to start if
 * that would leave patients with no way in at all.
 */
import { FirebaseAuthConfig } from "@/Utils/auth/externalAuthConfig";
import { providersFor } from "@/Utils/auth/oidcProviders";
import type { OidcProviderDescription } from "@/types/auth/externalAuthApi";

export type PatientLoginMethodKind = "sms" | "email" | "oidc" | "legacy_otp";

export interface PatientLoginMethod {
  kind: PatientLoginMethodKind;
  /** Present only for `oidc`: which provider this choice starts. */
  provider?: OidcProviderDescription;
}

export interface PatientLoginAvailability {
  methods: PatientLoginMethod[];
  /** True when the patient has a real choice to make. */
  hasChoice: boolean;
}

export function availablePatientLoginMethods(options: {
  firebase: FirebaseAuthConfig;
  providers: OidcProviderDescription[];
  /** Legacy CARE phone OTP stays available while it is still supported. */
  legacyOtpEnabled: boolean;
}): PatientLoginAvailability {
  const methods: PatientLoginMethod[] = [];

  if (options.firebase.enabled) {
    methods.push({ kind: "sms" });
    if (options.firebase.emailLinkCallbackUrl) methods.push({ kind: "email" });
  }
  for (const provider of providersFor(options.providers, "patient")) {
    methods.push({ kind: "oidc", provider });
  }
  // The existing CARE phone OTP is never removed by enabling a provider.
  // Retiring it is an operator decision (`legacyOtpEnabled`), not a side
  // effect of switching another method on.
  if (options.legacyOtpEnabled) {
    methods.push({ kind: "legacy_otp" });
  }

  return { methods, hasChoice: methods.length > 1 };
}

export const workforceProvidersAvailable = (
  providers: OidcProviderDescription[],
): boolean => providersFor(providers, "workforce").length > 0;
