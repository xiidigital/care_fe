import { useMutation } from "@tanstack/react-query";
import { navigate } from "raviger";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import CircularProgress from "@/components/Common/CircularProgress";
import Loading from "@/components/Common/Loading";

import { useAuthContext } from "@/hooks/useAuthUser";

import {
  takeEmailForSignIn,
  withoutEmailLinkParams,
} from "@/Utils/auth/emailLinkState";
import {
  completeEmailSignIn,
  isEmailSignInLink,
  takeIdTokenAndSignOut,
} from "@/Utils/auth/firebaseAuthClient";
import { safeDestination } from "@/Utils/auth/oidcTransaction";
import { sessionFromCareToken } from "@/Utils/auth/patientSession";
import mutate from "@/Utils/request/mutate";
import externalAuthApi from "@/types/auth/externalAuthApi";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Phase = "working" | "needs_email" | "failed";

/**
 * Land a Firebase email-link sign-in (ADR-0010 §3).
 *
 * When the link is opened on the device that requested it, the address is
 * already remembered and the exchange happens without a prompt. Opened
 * elsewhere, the address is asked for again — that is the supported
 * cross-device flow, not an error. The Firebase action parameters are removed
 * from the address bar before anything else, because the link is single-use.
 */
export default function FirebaseEmailLinkCallback() {
  const { t } = useTranslation();
  const { patientLogin } = useAuthContext();
  const [phase, setPhase] = useState<Phase>("working");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const signInLink = useRef<string>("");
  const destination = useRef<string>("/patient/home");
  const hasRun = useRef(false);

  const { mutateAsync: exchange, isPending } = useMutation({
    mutationFn: mutate(externalAuthApi.firebasePatientExchange),
  });

  const finish = useCallback(
    async (address: string) => {
      try {
        const credential = await completeEmailSignIn(
          address,
          signInLink.current,
        );
        const idToken = await takeIdTokenAndSignOut(credential);
        const { access } = await exchange({ id_token: idToken });
        const session = sessionFromCareToken(access, {
          provider: "firebase",
          email: address,
        });
        if (!session) {
          setPhase("failed");
          return;
        }
        patientLogin(session, destination.current);
      } catch {
        setError(t("external_login_failed"));
        setPhase("needs_email");
      }
    },
    [exchange, patientLogin, t],
  );

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const href = window.location.href;
    signInLink.current = href;
    destination.current = safeDestination(
      new URLSearchParams(window.location.search).get("redirect"),
      "/patient/home",
      window.location.origin,
    );

    // The sign-in link is a single-use credential. Take it out of the address
    // bar before the exchange, so a reload or a shared URL cannot replay it.
    window.history.replaceState({}, "", withoutEmailLinkParams(href));

    const run = async () => {
      try {
        if (!(await isEmailSignInLink(signInLink.current))) {
          setPhase("failed");
          return;
        }
      } catch {
        setPhase("failed");
        return;
      }

      const remembered = takeEmailForSignIn(window.sessionStorage);
      if (!remembered) {
        setPhase("needs_email");
        return;
      }
      await finish(remembered);
    };

    void run();
  }, [finish]);

  if (phase === "working") return <Loading />;

  if (phase === "failed") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4 text-center" role="alert">
          <h1 className="text-lg font-semibold">
            {t("external_login_failed")}
          </h1>
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

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form
        className="w-full max-w-sm space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (EMAIL_PATTERN.test(email.trim())) {
            setError("");
            void finish(email.trim().toLowerCase());
          }
        }}
      >
        <h1 className="text-lg font-semibold">{t("confirm_your_email")}</h1>
        <p className="text-sm text-gray-600">{t("confirm_your_email_help")}</p>
        <div className="space-y-2">
          <Label htmlFor="email-link-address">{t("email")}</Label>
          <Input
            id="email-link-address"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError("");
            }}
          />
        </div>
        {error && (
          <p className="text-sm text-red-500" role="alert" aria-live="polite">
            {error}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={isPending || !EMAIL_PATTERN.test(email.trim())}
        >
          {isPending ? (
            <CircularProgress className="text-white" />
          ) : (
            t("continue")
          )}
        </Button>
      </form>
    </div>
  );
}
