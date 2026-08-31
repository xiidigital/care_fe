# Multichannel patient and workforce authentication (frontend)

Implements the frontend half of ADR-0010 / ES-10. Both external providers are
**disabled by default**; a stock build behaves exactly as before.

## What ships

| Path                                              | Provider                 | Default               |
| ------------------------------------------------- | ------------------------ | --------------------- |
| Staff username + password + CARE MFA              | CARE                     | **active, unchanged** |
| Patient phone OTP                                 | CARE                     | **active, unchanged** |
| `Continue by SMS`                                 | Firebase phone auth      | off                   |
| `Continue by email`                               | Firebase email-link auth | off                   |
| `Continue with a CARE code`                       | CARE phone OTP           | **active, unchanged** |
| `Use another login method` (patient)              | Keycloak OIDC            | off                   |
| `Continue with your organization account` (staff) | Keycloak OIDC            | off                   |

No Keycloak server exists. The Keycloak code paths are complete, covered by
tests and dormant; activating them is configuration only — see
`care/docs/xii/operations/keycloak-activation-guide.md`.

**Every method is additive.** Enabling a provider never removes another one. An
installation may run CARE's own phone OTP alone, Firebase alongside it, Keycloak
alongside both, or any subset; all eight combinations are asserted in
`src/Utils/auth/__tests__/loginMethods.test.ts`. The only thing that removes the
legacy CARE OTP is an operator deliberately turning it off — per ADR-0010 §7, a
legacy path goes away once its replacement is proven and clients have migrated,
which is a separate decision from switching a provider on.

## Configuration

All frontend values are **public identifiers** and safe in a bundle. Keycloak
client secrets are backend-only and must never appear in any `REACT_*`
variable, in `.env.production.local`, or in a tracked environment file. The
full list with comments is in `.example.env`.

A provider whose configuration is incomplete is treated as **disabled**, not as
an error: the method is hidden rather than offered and then failing. Concretely:

- Firebase needs all four web values (`API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`,
  `APP_ID`); any missing one hides both Firebase methods.
- The email method additionally needs a valid https
  `REACT_FIREBASE_EMAIL_LINK_CALLBACK_URL`; without it only SMS is offered.
- Keycloak needs a safe https issuer, plus a client ID and a safe redirect URI
  **per principal**. A misconfigured patient client hides the patient choice
  without affecting the workforce choice.

The frontend and backend flags must be set together. The frontend cannot detect
a backend that disabled a provider independently, so a rendered choice pointing
at an intentionally absent route is a misconfiguration, not a supported state.

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

For Keycloak the browser performs Authorization Code + PKCE and posts
`code`, `code_verifier`, `nonce` and the exact `redirect_uri` to the matching
CARE exchange. The workforce exchange returns the ordinary CARE access/refresh
pair; the patient exchange returns a `PatientToken`.

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
so email and Keycloak patients no longer share a cache bucket.

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

`externalAuthEnabled.spec.ts` runs only when the app under test was built with
the providers configured — set `CARE_E2E_EXTERNAL_AUTH=enabled`; it skips
otherwise. It asserts what is rendered and where the browser is sent, including
that enabling Firebase does **not** remove CARE's own phone OTP.

### What is deliberately not automated

The reCAPTCHA step. Firebase escalates its invisible reCAPTCHA to a visual
challenge under headless automation, and solving CAPTCHAs is out of bounds. The
SMS journey is therefore verified in two halves that meet at the ID token:

1. the browser half, by `externalAuthEnabled.spec.ts` — the choice renders, the
   Google processing notice appears, an out-of-policy number cannot submit;
2. the token half, against the real dev Firebase project — a Google-signed ID
   token obtained through Firebase's documented test-number REST flow is
   exchanged for a CARE `PatientToken` that reaches the matching patient.

Keycloak has no runtime, so its enabled behavior stops at the authorization
request CARE builds.
