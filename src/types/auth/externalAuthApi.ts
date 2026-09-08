import { HttpMethod, Type } from "@/Utils/request/types";
import { JwtTokenObtainPair } from "@/types/auth/auth";
import { LoginByOtpResponse } from "@/types/otp/otp";

/**
 * The provider exchanges (ADR-0011).
 *
 * The OIDC routes exist on the backend only while some provider is configured
 * for that principal, and the login screen renders a method only for a
 * provider the backend has just described. So a request is never sent to a
 * route that is intentionally absent.
 */

export interface FirebaseExchangeRequest {
  id_token: string;
}

export interface OidcExchangeRequest {
  provider_id: string;
  code: string;
  code_verifier: string;
  nonce: string;
  redirect_uri: string;
}

/**
 * A provider as the backend describes it. Every field is a public identifier:
 * a client id and an issuer are meant to ship in a bundle. There is no secret
 * here, and no field that could carry one.
 *
 * `authorization_endpoint` comes from the issuer's own discovery document
 * rather than being composed here. Composing it would mean hardcoding a path,
 * and a path belongs to exactly one product.
 */
export interface OidcProviderDescription {
  id: string;
  display_name: string;
  principal_type: "workforce" | "patient";
  issuer: string;
  client_id: string;
  scopes: string[];
  authorization_endpoint: string;
  redirect_uri: string;
}

export interface LinkedIdentity {
  id: string;
  provider_id: string;
  display_name: string;
  linked_at: string;
  last_login_at: string | null;
}

export default {
  firebasePatientExchange: {
    path: "/api/v1/auth/firebase/patient/exchange/",
    method: HttpMethod.POST,
    noAuth: true,
    TBody: Type<FirebaseExchangeRequest>(),
    TRes: Type<LoginByOtpResponse>(),
  },
  oidcProviders: {
    path: "/api/v1/auth/providers/",
    method: HttpMethod.GET,
    noAuth: true,
    TRes: Type<OidcProviderDescription[]>(),
  },
  oidcWorkforceExchange: {
    path: "/api/v1/auth/oidc/workforce/exchange/",
    method: HttpMethod.POST,
    noAuth: true,
    TBody: Type<OidcExchangeRequest>(),
    TRes: Type<JwtTokenObtainPair>(),
  },
  oidcPatientExchange: {
    path: "/api/v1/auth/oidc/patient/exchange/",
    method: HttpMethod.POST,
    noAuth: true,
    TBody: Type<OidcExchangeRequest>(),
    TRes: Type<LoginByOtpResponse>(),
  },
  oidcLinkedIdentities: {
    path: "/api/v1/auth/oidc/identities/",
    method: HttpMethod.GET,
    TRes: Type<LinkedIdentity[]>(),
  },
  oidcLink: {
    path: "/api/v1/auth/oidc/link/",
    method: HttpMethod.POST,
    TBody: Type<OidcExchangeRequest>(),
    TRes: Type<{ id: string; provider_id: string; display_name: string }>(),
  },
  oidcUnlink: {
    path: "/api/v1/auth/oidc/link/{id}/",
    method: HttpMethod.DELETE,
    TRes: Type<Record<string, never>>(),
  },
} as const;
