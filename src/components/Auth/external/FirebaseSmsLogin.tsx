import careConfig from "@careConfig";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { isValidPhoneNumber } from "react-phone-number-input";

import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";

import CircularProgress from "@/components/Common/CircularProgress";

import {
  createRecaptchaVerifier,
  sendVerificationSms,
  takeIdTokenAndSignOut,
} from "@/Utils/auth/firebaseAuthClient";
import { sessionFromCareToken } from "@/Utils/auth/patientSession";
import mutate from "@/Utils/request/mutate";
import externalAuthApi from "@/types/auth/externalAuthApi";
import { TokenData } from "@/types/otp/otp";

import type { ConfirmationResult } from "firebase/auth";

const SMS_CODE_LENGTH = 6;
const RECAPTCHA_CONTAINER_ID = "care-firebase-recaptcha";

interface Props {
  onAuthenticated: (session: TokenData) => void;
  onBack?: () => void;
}

/**
 * Firebase phone authentication (ADR-0010 §3).
 *
 * CARE never generates, stores or compares the SMS code — Firebase verifies it
 * and returns an ID token, which is exchanged once for a CARE `PatientToken`.
 * Failures are deliberately uniform so nothing reveals whether a number is
 * known to CARE.
 */
export default function FirebaseSmsLogin({ onAuthenticated, onBack }: Props) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const [codeSent, setCodeSent] = useState(false);

  const allowedCodes = careConfig.firebaseAuth.smsCountryCodes;
  const isInPolicy =
    isValidPhoneNumber(phone) &&
    allowedCodes.some((prefix) => phone.startsWith(prefix));

  const { mutateAsync: exchange, isPending: isExchanging } = useMutation({
    mutationFn: mutate(externalAuthApi.firebasePatientExchange),
  });

  const sendCode = async () => {
    if (!isInPolicy || isSending) return;
    setIsSending(true);
    setError("");
    try {
      const verifier = await createRecaptchaVerifier(RECAPTCHA_CONTAINER_ID);
      confirmation.current = await sendVerificationSms(phone, verifier);
      setCodeSent(true);
    } catch {
      setError(t("external_login_failed"));
    } finally {
      setIsSending(false);
    }
  };

  const verifyCode = async () => {
    if (!confirmation.current || code.length !== SMS_CODE_LENGTH) return;
    setError("");
    try {
      const credential = await confirmation.current.confirm(code);
      const idToken = await takeIdTokenAndSignOut(credential);
      const { access } = await exchange({ id_token: idToken });
      const session = sessionFromCareToken(access, {
        provider: "firebase",
        phoneNumber: phone,
      });
      if (!session) throw new Error("external_login_failed");
      onAuthenticated(session);
    } catch {
      // Uniform message: it must not distinguish a wrong code from an
      // out-of-policy number or an unknown patient.
      setError(t("external_login_failed"));
    }
  };

  const isBusy = isSending || isExchanging;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (codeSent) {
          void verifyCode();
        } else {
          void sendCode();
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="firebase-phone">{t("phone_number")}</Label>
        <PhoneInput
          id="firebase-phone"
          name="firebase-phone"
          value={phone}
          onChange={(value) => {
            setPhone(value ?? "");
            setError("");
          }}
          disabled={codeSent || isBusy}
          placeholder={t("enter_phone_number")}
        />
        {phone && !isInPolicy && (
          <p className="text-sm text-gray-600" role="status">
            {t("sms_country_policy_notice", {
              countries: allowedCodes.join(", "),
            })}
          </p>
        )}
      </div>

      {codeSent && (
        <div className="space-y-2">
          <Label htmlFor="firebase-sms-code">
            {t("enter_the_verification_code")}
          </Label>
          <div className="flex justify-center">
            <InputOTP
              id="firebase-sms-code"
              value={code}
              maxLength={SMS_CODE_LENGTH}
              autoComplete="one-time-code"
              autoFocus
              onChange={(value) => {
                setCode(value);
                setError("");
              }}
            >
              <InputOTPGroup>
                {Array.from({ length: SMS_CODE_LENGTH }).map((_, index) => (
                  <InputOTPSlot key={index} index={index} className="size-10" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500">
        {t("firebase_sms_privacy_notice")}
      </p>

      {error && (
        <p className="text-sm text-red-500" role="alert" aria-live="polite">
          {error}
        </p>
      )}

      {/* Firebase attaches its invisible reCAPTCHA challenge here. */}
      <div id={RECAPTCHA_CONTAINER_ID} />

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={
          isBusy ||
          (!codeSent && !isInPolicy) ||
          (codeSent && code.length !== SMS_CODE_LENGTH)
        }
      >
        {isBusy ? (
          <CircularProgress className="text-white" />
        ) : codeSent ? (
          t("verify_otp")
        ) : (
          t("continue_by_sms")
        )}
      </Button>

      {onBack && (
        <Button
          type="button"
          variant="link"
          className="w-full"
          onClick={onBack}
          disabled={isBusy}
        >
          {t("use_a_different_login_method")}
        </Button>
      )}
    </form>
  );
}
