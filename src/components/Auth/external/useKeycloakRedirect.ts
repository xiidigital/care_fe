import careConfig from "@careConfig";
import { useCallback, useState } from "react";

import {
  KeycloakPrincipal,
  safeDestination,
  saveTransaction,
  startAuthorization,
} from "@/Utils/auth/oidcTransaction";

/**
 * Start a Keycloak login (ADR-0010 §6).
 *
 * Nothing here names or predicts what Keycloak does internally: the caller asks
 * for a principal, and the browser is sent to the issuer. The PKCE verifier,
 * state and nonce stay in this tab and are never logged.
 */
export function useKeycloakRedirect(principal: KeycloakPrincipal) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const client = careConfig.keycloak[principal];

  const redirect = useCallback(
    async (destination: string) => {
      if (!careConfig.keycloak.enabled || !client) return;

      setIsRedirecting(true);
      try {
        const { authorizationUrl, transaction } = await startAuthorization({
          issuerUrl: careConfig.keycloak.issuerUrl,
          clientId: client.clientId,
          redirectUri: client.redirectUri,
          principal,
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
        setIsRedirecting(false);
        throw new Error("external_login_failed");
      }
    },
    [client, principal],
  );

  return { redirect, isRedirecting, isAvailable: Boolean(client) };
}
