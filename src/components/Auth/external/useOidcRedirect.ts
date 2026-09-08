import { useCallback, useState } from "react";

import {
  OidcIntent,
  safeDestination,
  saveTransaction,
  startAuthorization,
} from "@/Utils/auth/oidcTransaction";
import { OidcProviderDescription } from "@/types/auth/externalAuthApi";

/**
 * Start an OIDC login (ADR-0011 §6).
 *
 * Nothing here names or predicts what the provider does internally: the caller
 * hands over a provider the backend described, and the browser is sent to the
 * authorization endpoint that provider's issuer published. The PKCE verifier,
 * state and nonce stay in this tab and are never logged.
 */
export function useOidcRedirect() {
  const [redirectingTo, setRedirectingTo] = useState<string | null>(null);

  const redirect = useCallback(
    async (
      provider: OidcProviderDescription,
      destination: string,
      intent: OidcIntent = "login",
    ) => {
      setRedirectingTo(provider.id);
      try {
        const { authorizationUrl, transaction } = await startAuthorization({
          provider,
          intent,
          destination: safeDestination(
            destination,
            destination,
            window.location.origin,
          ),
          crypto: window.crypto,
        });
        saveTransaction(transaction, window.sessionStorage);
        window.location.assign(authorizationUrl);
      } catch {
        setRedirectingTo(null);
        throw new Error("external_login_failed");
      }
    },
    [],
  );

  return { redirect, redirectingTo };
}
