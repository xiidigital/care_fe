import careConfig from "@careConfig";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { useKeycloakRedirect } from "@/components/Auth/external/useKeycloakRedirect";

import { workforceKeycloakAvailable } from "@/Utils/auth/loginMethods";

interface Props {
  disabled?: boolean;
}

/**
 * The consultorio Keycloak action (ADR-0010 §7.4).
 *
 * Rendered only while Keycloak is enabled *and* its workforce client is fully
 * configured. Username, password and CARE MFA are untouched and remain the way
 * in while this is hidden, which is the default.
 */
export default function WorkforceKeycloakButton({ disabled }: Props) {
  const { t } = useTranslation();
  const { redirect, isRedirecting } = useKeycloakRedirect("workforce");

  if (!workforceKeycloakAvailable(careConfig.keycloak)) return null;

  const start = async () => {
    try {
      const redirectParam = new URLSearchParams(window.location.search).get(
        "redirect",
      );
      await redirect(redirectParam ?? "/");
    } catch {
      toast.error(t("external_login_failed"));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-gray-200" />
        <span className="text-xs uppercase text-gray-500">{t("or")}</span>
        <span className="h-px flex-1 bg-gray-200" />
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={disabled || isRedirecting}
        onClick={() => void start()}
      >
        {t("continue_with_keycloak")}
      </Button>
    </div>
  );
}
