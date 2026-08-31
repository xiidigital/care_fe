import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import CircularProgress from "@/components/Common/CircularProgress";

import { rememberEmailForSignIn } from "@/Utils/auth/emailLinkState";
import { sendEmailSignInLink } from "@/Utils/auth/firebaseAuthClient";

interface Props {
  onBack?: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Firebase passwordless email-link sign-in (ADR-0010 §3).
 *
 * The credential is a single-use link, not a numeric code, and CARE never sees
 * the action code. The confirmation message is identical whether or not the
 * address is known, so nothing here enumerates accounts.
 */
export default function FirebaseEmailLinkLogin({ onBack }: Props) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState("");

  const isValid = EMAIL_PATTERN.test(email.trim());

  const submit = async () => {
    if (!isValid || isSending) return;
    setIsSending(true);
    setError("");
    try {
      const address = email.trim().toLowerCase();
      await sendEmailSignInLink(address);
      rememberEmailForSignIn(address, window.sessionStorage);
      setIsSent(true);
    } catch {
      setError(t("external_login_failed"));
    } finally {
      setIsSending(false);
    }
  };

  if (isSent) {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <p className="text-sm text-gray-700">{t("email_link_sent_notice")}</p>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            setIsSent(false);
            setEmail("");
          }}
        >
          {t("use_a_different_email")}
        </Button>
        {onBack && (
          <Button
            type="button"
            variant="link"
            className="w-full"
            onClick={onBack}
          >
            {t("use_a_different_login_method")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="firebase-email">{t("email")}</Label>
        <Input
          id="firebase-email"
          name="firebase-email"
          type="email"
          autoComplete="email"
          value={email}
          disabled={isSending}
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
        disabled={!isValid || isSending}
      >
        {isSending ? (
          <CircularProgress className="text-white" />
        ) : (
          t("continue_by_email")
        )}
      </Button>

      {onBack && (
        <Button
          type="button"
          variant="link"
          className="w-full"
          onClick={onBack}
          disabled={isSending}
        >
          {t("use_a_different_login_method")}
        </Button>
      )}
    </form>
  );
}
