import careConfig from "@careConfig";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import FirebaseEmailLinkLogin from "@/components/Auth/external/FirebaseEmailLinkLogin";
import FirebaseSmsLogin from "@/components/Auth/external/FirebaseSmsLogin";
import { useOidcRedirect } from "@/components/Auth/external/useOidcRedirect";

import { useAuthContext } from "@/hooks/useAuthUser";

import {
  PatientLoginMethod,
  availablePatientLoginMethods,
} from "@/Utils/auth/loginMethods";
import { useOidcProviders } from "@/Utils/auth/useOidcProviders";
import { OidcProviderDescription } from "@/types/auth/externalAuthApi";
import { TokenData } from "@/types/otp/otp";

interface Props {
  /** Where a successful patient login should land. Must be same-origin. */
  destination: string;
  /** Rendered when no external method is configured. */
  legacyOtpForm: React.ReactNode;
  legacyOtpEnabled?: boolean;
}

/**
 * The patient entry point (ADR-0011 §6).
 *
 * Each configured provider appears under the name its operator gave it. That
 * name is the only thing a patient is told about it: what the provider does
 * internally — password, OTP, passkey, federation — is the provider's
 * business, and CARE neither knows nor renders it.
 *
 * `display_name` is operator-supplied text, rendered as text. React escapes
 * it, nothing interpolates it into markup, and the authorization URL is built
 * from the provider's own endpoint rather than from anything shown here.
 */
export default function PatientLoginMethods({
  destination,
  legacyOtpForm,
  legacyOtpEnabled = true,
}: Props) {
  const { t } = useTranslation();
  const { patientLogin } = useAuthContext();
  const [selected, setSelected] = useState<PatientLoginMethod | null>(null);
  const { providers } = useOidcProviders();

  const { methods, hasChoice } = availablePatientLoginMethods({
    firebase: careConfig.firebaseAuth,
    providers,
    legacyOtpEnabled,
  });
  const { redirect, redirectingTo } = useOidcRedirect();

  const onAuthenticated = (session: TokenData) =>
    patientLogin(session, destination);

  const startProvider = async (provider: OidcProviderDescription) => {
    try {
      await redirect(provider, destination);
    } catch {
      toast.error(t("external_login_failed"));
    }
  };

  // Only the legacy path is configured: keep the current form exactly as it is.
  if (
    methods.length === 0 ||
    (methods.length === 1 && methods[0].kind === "legacy_otp")
  ) {
    return <>{legacyOtpForm}</>;
  }

  const active = selected ?? (hasChoice ? null : methods[0]);

  if (active?.kind === "legacy_otp") return <>{legacyOtpForm}</>;
  if (active?.kind === "sms") {
    return (
      <FirebaseSmsLogin
        onAuthenticated={onAuthenticated}
        onBack={hasChoice ? () => setSelected(null) : undefined}
      />
    );
  }
  if (active?.kind === "email") {
    return (
      <FirebaseEmailLinkLogin
        onBack={hasChoice ? () => setSelected(null) : undefined}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600" id="patient-login-methods-label">
        {t("choose_your_login_method_to_continue")}
      </p>
      <div
        className="flex flex-col gap-3"
        role="group"
        aria-labelledby="patient-login-methods-label"
      >
        {methods.map((method) => {
          if (method.kind === "sms") {
            return (
              <Button
                key="sms"
                type="button"
                variant="primary"
                className="w-full"
                onClick={() => setSelected(method)}
              >
                {t("continue_by_sms")}
              </Button>
            );
          }
          if (method.kind === "email") {
            return (
              <Button
                key="email"
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setSelected(method)}
              >
                {t("continue_by_email")}
              </Button>
            );
          }
          if (method.kind === "oidc" && method.provider) {
            const provider = method.provider;
            return (
              <Button
                key={provider.id}
                type="button"
                variant="outline"
                className="w-full"
                disabled={redirectingTo !== null}
                onClick={() => void startProvider(provider)}
              >
                {redirectingTo === provider.id
                  ? t("redirecting")
                  : t("continue_with_provider", {
                      provider: provider.display_name,
                    })}
              </Button>
            );
          }
          return (
            <Button
              key="legacy_otp"
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setSelected(method)}
            >
              {t("continue_with_care_code")}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
