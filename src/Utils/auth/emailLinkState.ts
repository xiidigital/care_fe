/**
 * The minimum state a same-device Firebase email-link sign-in needs.
 *
 * Firebase requires the address the link was requested for to be supplied again
 * when the link is opened. Only that one value is remembered, only for this
 * tab, and it is removed as soon as the callback has used it. When the link is
 * opened on another device the value is simply absent and the callback asks for
 * the address again — which is the supported flow, not an error.
 */
const STORAGE_KEY = "care_email_link_address";

export function rememberEmailForSignIn(email: string, storage: Storage): void {
  storage.setItem(STORAGE_KEY, email.trim().toLowerCase());
}

export function takeEmailForSignIn(storage: Storage): string | null {
  const email = storage.getItem(STORAGE_KEY);
  storage.removeItem(STORAGE_KEY);
  return email && email.trim() ? email.trim().toLowerCase() : null;
}

export function forgetEmailForSignIn(storage: Storage): void {
  storage.removeItem(STORAGE_KEY);
}

/**
 * Remove the Firebase action parameters from the address bar once they have
 * been consumed. The sign-in link is single-use, but leaving it in history or
 * in a referrer header is needless exposure.
 */
export const EMAIL_LINK_PARAMS = [
  "apiKey",
  "oobCode",
  "mode",
  "lang",
  "continueUrl",
  "tenantId",
] as const;

export function withoutEmailLinkParams(href: string): string {
  try {
    const url = new URL(href);
    EMAIL_LINK_PARAMS.forEach((param) => url.searchParams.delete(param));
    const search = url.searchParams.toString();
    return `${url.pathname}${search ? `?${search}` : ""}`;
  } catch {
    return "/";
  }
}
