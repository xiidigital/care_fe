/**
 * Which OIDC providers this deployment offers (ADR-0011 §6).
 *
 * The list comes from the backend that serves the login, not from the build. A
 * build used to declare its own providers, which meant a frontend could
 * advertise a method the backend did not have — a dead end the user reaches
 * only after being redirected to an issuer. Asking the backend removes that
 * class of defect entirely.
 *
 * A failure to fetch renders no external method and no error. CARE's own login
 * is unaffected by an identity provider being unreachable, and announcing it on
 * the login screen would be alarming rather than useful.
 */
import { useQuery } from "@tanstack/react-query";

import query from "@/Utils/request/query";
import externalAuthApi, {
  OidcProviderDescription,
} from "@/types/auth/externalAuthApi";

const EMPTY: OidcProviderDescription[] = [];

export function useOidcProviders() {
  const { data, isLoading } = useQuery({
    queryKey: ["oidc-providers"],
    queryFn: query(externalAuthApi.oidcProviders, { silent: true }),
    // The set changes only when an operator changes configuration and
    // restarts, so it need not be re-asked on every mount.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return { providers: data ?? EMPTY, isLoading };
}
