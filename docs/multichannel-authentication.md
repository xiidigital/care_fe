# Multichannel patient and workforce authentication (frontend)

Implements the frontend half of ADR-0010 / ES-10 (Firebase) and ADR-0011 /
ES-11 (OIDC). Every external method is **off by default**; a stock build
behaves exactly as before.

## What ships

| Path                                              | Provider                 | Default               |
| ------------------------------------------------- | ------------------------ | --------------------- |
| Staff username + password + CARE MFA              | CARE                     | **active, unchanged** |
| Patient phone OTP                                 | CARE                     | **active, unchanged** |
| `Continue by SMS`                                 | Firebase phone auth      | off                   |
| `Continue by email`                               | Firebase email-link auth | off                   |
| `Continue with a CARE code`                       | CARE phone OTP           | **active, unchanged** |
| `Continue with <provider>` (patient)              | Any OIDC provider        | none configured       |
| `Continue with <provider>` (staff)                | Any OIDC provider        | none configured       |

**Providers are plural and come from the backend.** The login screen asks
`GET /api/v1/auth/providers/` and renders one choice per configured provider,
under the name its operator gave it. There is no build-time provider list: a
build that declared its own could advertise a method the backend does not have.
An operator adds a provider by changing backend configuration and restarting —
never by shipping a new bundle. See
`care/docs/xii/operations/oidc-provider-guide.md`.

**Every method is additive.** Enabling one never removes another. An
installation may run CARE's own phone OTP alone, Firebase alongside it, one or
more OIDC providers alongside both, or any subset;
`src/Utils/auth/__tests__/loginMethods.test.ts` asserts the matrix. The only
thing that removes the legacy CARE OTP is an operator deliberately turning it
off, and the backend refuses to start if that would leave patients with no way
in at all.

## Configuration

All frontend values are **public identifiers** and safe in a bundle. Provider
client secrets are backend-only and must never appear in any `REACT_*`
variable, in `.env.production.local`, or in a tracked environment file. The
full list with comments is in `.example.env`.

Only Firebase is configured here. OIDC providers are backend configuration
(`OIDC_PROVIDERS`); there are no `REACT_KEYCLOAK_*` variables.

A provider whose configuration is incomplete is treated as **disabled**, not as
an error: the method is hidden rather than offered and then failing. Concretely:

- Firebase needs all four web values (`API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`,
  `APP_ID`); any missing one hides both Firebase methods.
- The email method additionally needs a valid https
  `REACT_FIREBASE_EMAIL_LINK_CALLBACK_URL`; without it only SMS is offered.
- An OIDC provider needs a usable authorization endpoint and redirect URI —
  https, or http on loopback for a local test issuer. One that is not usable is
  hidden without affecting any other provider.

Firebase is the one method whose two sides must still be set together. The
OIDC half cannot drift: the list the frontend renders is the list the backend
just described, and a failure to fetch it renders no external method and no
error banner — CARE's own login is unaffected by an issuer being unreachable.

### SMS country policy

`REACT_FIREBASE_SMS_COUNTRY_CODES` defaults to `+52` (Mexico), matching
ADR-0010. It is enforced in three places that must agree:

1. this variable — restricts what a person can submit in the browser;
2. the Firebase project's SMS region settings — restricts delivery;
3. the backend `FIREBASE_AUTH_SMS_COUNTRY_CODES` — **the only authoritative
   one**, re-checked against the verified number in the ID token before a CARE
   token is issued.

The frontend check is a usability affordance. It is not a control.

## How a patient login works

```text
browser                       provider                 CARE backend
   │  choose SMS / email          │                          │
   ├─────────────────────────────►│  (Firebase verifies)     │
   │  ◄── Firebase ID token ──────┤                          │
   ├──────── POST /api/v1/auth/firebase/patient/exchange/ ───►│
   │  ◄──────────── CARE PatientToken ────────────────────────┤
```

CARE never generates, stores or compares the SMS code or the email action code.
The Firebase session is ended as soon as the ID token has been taken
(`takeIdTokenAndSignOut`); the CARE `PatientToken` is the only credential that
survives, and it enters the existing session lifecycle unchanged.

For an OIDC provider the browser performs Authorization Code + PKCE and posts
`provider_id`, `code`, `code_verifier`, `nonce` and the exact `redirect_uri` to
the matching CARE exchange. The workforce exchange returns the ordinary CARE
access/refresh pair; the patient exchange returns a `PatientToken`.

The authorization URL is **never composed here**. It is built on the
`authorization_endpoint` the backend read from the issuer's discovery document,
because a path belongs to one product: Keycloak's
`/protocol/openid-connect/auth` is not Entra ID's `/oauth2/v2.0/authorize`.

## Session shape

`TokenData` no longer requires a phone number. A session records the provider
and exactly one identity — `phoneNumber`, `email` or `patientId` — derived from
the CARE token's own claims (`sessionFromCareToken`).

Sessions written by earlier builds are migrated on read and treated as `otp`.
A stored session that cannot be parsed, or that identifies nobody, is
**discarded** rather than repaired, so corrupt state logs the patient out
instead of half-authenticating them. Contacts are masked wherever they are
displayed (`maskedContact`).

React Query cache keys use `sessionIdentityKey` rather than the phone number,
so email and OIDC patients no longer share a cache bucket.

## Linking a provider to an existing account

A signed-in workforce user links a provider from their account settings
(`LinkedIdentities`). CARE binds the external subject to **them** — a target
named in the request is ignored, which is the difference between linking an
identity and taking over an account. Unlinking is immediate and leaves the
account and its other sign-in methods untouched.

Login and linking share one callback URL, because a provider knows one redirect
URI per principal. The transaction carries its `intent` so the callback knows
which it is; without that, a link attempt would be exchanged as a login and
fail for a subject that is, by definition, not linked yet.

Patients have no self-service linking. A patient link reaches a clinical record
and stays on the administrative path.

## Security notes

- PKCE verifier, state and nonce are generated with `window.crypto`, stored in
  `sessionStorage` only, consumed exactly once, and never logged.
- A callback validates `state` **before** contacting CARE, and clears the
  transaction whether it succeeds or fails.
- The authorization code, state and the Firebase action code are removed from
  the address bar with `history.replaceState` as soon as they are read.
- Only a same-origin destination survives `safeDestination`, so a callback
  cannot be used as an open redirect.
- Failures are uniform: nothing distinguishes an unknown patient from an
  invalid credential or an out-of-policy number.
- A provider's `display_name` is operator-supplied text. It is rendered as
  text and never interpolated into markup or into the authorization URL.
- The SMS screen discloses that Google receives and stores the phone number for
  spam and abuse prevention. No clinical context appears in any message.

## Tests

```bash
npm run test:unit    # src/Utils/auth/__tests__ — config gating, PKCE,
                     # callback validation, session parsing and masking
npm run lint
npm run build
npx playwright test tests/auth/externalAuthDisabled.spec.ts
```

`externalAuthDisabled.spec.ts` asserts the **dormant** state, which is what
actually ships: no external choice is rendered, no provider is contacted, and a
forged callback fails closed without reaching a CARE exchange.

`externalAuthEnabled.spec.ts` covers the enabled states. Its **OIDC journeys
need no special build**: they stub the one provider response and assert what
the browser renders and where it is sent, including that a configured provider
does not remove CARE's own phone OTP. Its **Firebase journeys** still need a
build with the Firebase values set — `CARE_E2E_EXTERNAL_AUTH=enabled` — and
skip otherwise.

### What is deliberately not automated

The reCAPTCHA step. Firebase escalates its invisible reCAPTCHA to a visual
challenge under headless automation, and solving CAPTCHAs is out of bounds. The
SMS journey is therefore verified in two halves that meet at the ID token:

1. the browser half, by `externalAuthEnabled.spec.ts` — the choice renders, the
   Google processing notice appears, an out-of-policy number cannot submit;
2. the token half, against the real dev Firebase project — a Google-signed ID
   token obtained through Firebase's documented test-number REST flow is
   exchanged for a CARE `PatientToken` that reaches the matching patient.

The OIDC half no longer stops at the authorization request. The backend's
conformance suite (`care/users/tests/test_oidc_conformance.py`) drives a real
Authorization Code + PKCE round trip against a Keycloak container, so the
contract the browser relies on is proved against a real issuer rather than only
against a double.
