/**
 * Pure predicates over the provider list the backend describes (ADR-0011 §6).
 *
 * Deliberately dependency-free. `useOidcProviders` does the fetching next
 * door; keeping the rules here means they can be unit-tested without pulling
 * in the request layer, the query client or the build configuration.
 */
import type { OidcProviderDescription } from "@/types/auth/externalAuthApi";

/**
 * https, or http on loopback for a local test issuer. No credentials and no
 * fragment: the browser is about to be sent here, and the redirect URI is
 * compared byte-for-byte by the backend.
 */
export function isSafeHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const isLoopbackHttp =
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return (
      (url.protocol === "https:" || isLoopbackHttp) &&
      !url.username &&
      !url.password &&
      !url.hash
    );
  } catch {
    return false;
  }
}

/**
 * A provider is usable only if everything the browser needs is present and
 * safe. An incomplete one is hidden rather than reported: a button that
 * redirects nowhere is worse than no button.
 */
export const isUsableProvider = (provider: OidcProviderDescription): boolean =>
  Boolean(
    provider.id &&
    provider.display_name &&
    provider.client_id &&
    isSafeHttpsUrl(provider.authorization_endpoint) &&
    isSafeHttpsUrl(provider.redirect_uri),
  );

export function providersFor(
  providers: OidcProviderDescription[],
  principal: "workforce" | "patient",
): OidcProviderDescription[] {
  return providers.filter(
    (provider) =>
      provider.principal_type === principal && isUsableProvider(provider),
  );
}
