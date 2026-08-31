import { HttpMethod, Type } from "@/Utils/request/types";
import { JwtTokenObtainPair } from "@/types/auth/auth";
import { LoginByOtpResponse } from "@/types/otp/otp";

/**
 * The two provider exchanges (ADR-0010 §5).
 *
 * These routes exist on the backend only while their provider flag is on. The
 * frontend hides the matching method under the same condition, so a request is
 * never sent to a route that is intentionally absent.
 */

export interface FirebaseExchangeRequest {
  id_token: string;
}

export interface KeycloakExchangeRequest {
  code: string;
  code_verifier: string;
  nonce: string;
  redirect_uri: string;
}

export default {
  firebasePatientExchange: {
    path: "/api/v1/auth/firebase/patient/exchange/",
    method: HttpMethod.POST,
    noAuth: true,
    TBody: Type<FirebaseExchangeRequest>(),
    TRes: Type<LoginByOtpResponse>(),
  },
  keycloakWorkforceExchange: {
    path: "/api/v1/auth/keycloak/workforce/exchange/",
    method: HttpMethod.POST,
    noAuth: true,
    TBody: Type<KeycloakExchangeRequest>(),
    TRes: Type<JwtTokenObtainPair>(),
  },
  keycloakPatientExchange: {
    path: "/api/v1/auth/keycloak/patient/exchange/",
    method: HttpMethod.POST,
    noAuth: true,
    TBody: Type<KeycloakExchangeRequest>(),
    TRes: Type<LoginByOtpResponse>(),
  },
} as const;
