import careConfig from "@careConfig";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import FirebaseEmailLinkLogin from "@/components/Auth/external/FirebaseEmailLinkLogin";
import FirebaseSmsLogin from "@/components/Auth/external/FirebaseSmsLogin";
import { useKeycloakRedirect } from "@/components/Auth/external/useKeycloakRedirect";

import { useAuthContext } from "@/hooks/useAuthUser";

import {
  PatientLoginMethod,
  availablePatientLoginMethods,
} from "@/Utils/auth/loginMethods";
import { TokenData } from "@/types/otp/otp";

interface Props {
  /** Where a successful patient login should land. Must be same-origin. */
  destination: string;
  /** Rendered when no external method is configured. */
  legacyOtpForm: React.ReactNode;
  legacyOtpEnabled?: boolean;
}

/**
 * The patient entry point (ADR-0010 §3).
 *
 * `Use another login method` is Keycloak and appears only when Keycloak is
 * enabled. It deliberately does not name or predict the mechanism configured
 * inside Keycloak — password, OTP, passkey and federation are all the same
 * choice from here.
 */
export default function PatientLoginMethods({
  destination,
  legacyOtpForm,
  legacyOtpEnabled = true,
}: Props) {
  const { t } = useTranslation();
  const { patientLogin } = useAuthContext();
  const [selected, setSelected] = useState<PatientLoginMethod | null>(null);

  const { methods, hasChoice } = availablePatientLoginMethods({
    firebase: careConfig.firebaseAuth,
    keycloak: careConfig.keycloak,
    legacyOtpEnabled,
  });
  const keycloak = useKeycloakRedirect("patient");

  const onAuthenticated = (session: TokenData) =>
    patientLogin(session, destination);

  const startKeycloak = async () => {
    try {
      await keycloak.redirect(destination);
    } catch {
      toast.error(t("external_login_failed"));
    }
  };

  // Only the legacy path is configured: keep the current form exactly as it is.
  if (
    methods.length === 0 ||
    (methods.length === 1 && methods[0] === "legacy_otp")
  ) {
    return <>{legacyOtpForm}</>;
  }

  const active = selected ?? (hasChoice ? null : methods[0]);

  if (active === "legacy_otp") return <>{legacyOtpForm}</>;
  if (active === "sms") {
    return (
      <FirebaseSmsLogin
        onAuthenticated={onAuthenticated}
        onBack={hasChoice ? () => setSelected(null) : undefined}
      />
    );
  }
  if (active === "email") {
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
        {methods.includes("sms") && (
          <Button
            type="button"
            variant="primary"
            className="w-full"
            onClick={() => setSelected("sms")}
          >
            {t("continue_by_sms")}
          </Button>
        )}
        {methods.includes("email") && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setSelected("email")}
          >
            {t("continue_by_email")}
          </Button>
        )}
        {methods.includes("keycloak") && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={keycloak.isRedirecting}
            onClick={() => void startKeycloak()}
          >
            {t("use_another_login_method")}
          </Button>
        )}
        {methods.includes("legacy_otp") && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setSelected("legacy_otp")}
          >
            {t("continue_with_care_code")}
          </Button>
        )}
      </div>
    </div>
  );
}
