import { useMutation } from "@tanstack/react-query";
import { navigate } from "raviger";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

import Loading from "@/components/Common/Loading";

import { useAuthContext } from "@/hooks/useAuthUser";

import { OidcPrincipal, resolveCallback } from "@/Utils/auth/oidcTransaction";
import { sessionFromCareToken } from "@/Utils/auth/patientSession";
import mutate from "@/Utils/request/mutate";
import { JwtTokenObtainPair } from "@/types/auth/auth";
import externalAuthApi from "@/types/auth/externalAuthApi";
import { LoginByOtpResponse } from "@/types/otp/otp";

interface Props {
  principal: OidcPrincipal;
}

/**
 * Complete an OIDC login (ADR-0011 §6).
 *
 * State is verified against this tab's stored transaction *before* anything is
 * sent to CARE, and the transaction is consumed whether the callback succeeds
 * or fails. The authorization code, verifier and nonce are never logged, and
 * the response parameters are removed from the address bar immediately.
 */
export default function OidcCallback({ principal }: Props) {
  const { t } = useTranslation();
  const { patientLogin, workforceSessionLogin } = useAuthContext();
  const [failed, setFailed] = useState(false);
  const hasRun = useRef(false);

  const { mutateAsync: exchangeWorkforce } = useMutation({
    mutationFn: mutate(externalAuthApi.oidcWorkforceExchange),
  });
  const { mutateAsync: exchangePatient } = useMutation({
    mutationFn: mutate(externalAuthApi.oidcPatientExchange),
  });
  const { mutateAsync: linkIdentity } = useMutation({
    mutationFn: mutate(externalAuthApi.oidcLink),
  });

  useEffect(() => {
    // A callback is processed exactly once, even under React's double effect.
    if (hasRun.current) return;
    hasRun.current = true;

    const resolution = resolveCallback({
      search: window.location.search,
      principal,
      storage: window.sessionStorage,
    });

    // The code and state are single-use transaction material: drop them from
    // the address bar before anything else, so they cannot leak through
    // history, a bookmark or a referrer.
    window.history.replaceState({}, "", window.location.pathname);

    const run = async () => {
      if (!resolution.ok) {
        setFailed(true);
        return;
      }

      const { transaction, code } = resolution;
      const payload = {
        provider_id: transaction.providerId,
        code,
        code_verifier: transaction.codeVerifier,
        nonce: transaction.nonce,
        redirect_uri: transaction.redirectUri,
      };

      try {
        // Login and link share this callback URL, because a provider knows one
        // redirect URI per principal. The transaction says which was intended;
        // exchanging a link attempt as a login would fail for a subject that
        // is, by definition, not linked yet.
        if (transaction.intent === "link") {
          await linkIdentity(payload);
          navigate(transaction.destination);
          return;
        }
        if (principal === "workforce") {
          const tokens = (await exchangeWorkforce(
            payload,
          )) as JwtTokenObtainPair;
          await workforceSessionLogin(tokens, transaction.destination);
          return;
        }
        const { access } = (await exchangePatient(
          payload,
        )) as LoginByOtpResponse;
        const session = sessionFromCareToken(access, { provider: "oidc" });
        if (!session) {
          setFailed(true);
          return;
        }
        patientLogin(session, transaction.destination);
      } catch {
        // Uniform failure. It must not distinguish an unknown subject from an
        // invalid token or a disabled account.
        setFailed(true);
      }
    };

    void run();
  }, [
    principal,
    exchangePatient,
    exchangeWorkforce,
    linkIdentity,
    patientLogin,
    workforceSessionLogin,
  ]);

  if (!failed) return <Loading />;

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center" role="alert">
        <h1 className="text-lg font-semibold">{t("external_login_failed")}</h1>
        <p className="text-sm text-gray-600">
          {t("external_login_failed_help")}
        </p>
        <Button
          type="button"
          variant="primary"
          className="w-full"
          onClick={() => navigate("/login")}
        >
          {t("back_to_login")}
        </Button>
      </div>
    </div>
  );
}
