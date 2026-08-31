import { PatientSession } from "@/Utils/auth/patientSession";

/**
 * A patient session (ADR-0010).
 *
 * `phoneNumber` was required when phone OTP was the only way in. Firebase
 * email-link and Keycloak patients have no phone number, so exactly one of
 * `phoneNumber`, `email` and `patientId` identifies the session instead.
 *
 * Parsing, migration of pre-ADR-0010 sessions and display masking live in
 * `@/Utils/auth/patientSession`.
 */
export type TokenData = PatientSession;

export interface SendOtpRequest {
  phone_number: string;
}

export interface SendOtpResponse {
  otp: string; // "generated" on success
}

export interface LoginByOtpRequest {
  phone_number: string;
  otp: string;
}

export interface LoginByOtpResponse {
  access: string;
}

export interface ConfirmPasswordResetOtpRequest {
  phone_number: string;
  otp: string;
  password: string;
  username?: string;
}

export interface ConfirmPasswordResetOtpResponse {
  message: string;
}
