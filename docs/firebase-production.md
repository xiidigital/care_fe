# Firebase production delivery

This repository contains the public inputs and hosting rules needed to
reproduce the CARE production frontend. It does not contain Firebase
credentials, reCAPTCHA secrets, Sentry credentials or patient data.

## Current target

| setting | value |
|---|---|
| frontend | `https://care-prod-jsgaviota-2608.web.app` |
| backend API | `https://care-prod-api-3pm2amdrsa-uc.a.run.app` |
| Firebase project | `care-prod-jsgaviota-2608` |
| output directory | `build` |
| patient login | disabled |
| Sentry | disabled unless explicitly configured |

The backend must allow the exact frontend origin through CORS. A frontend build
embeds its selected API URL, so changing the API requires a new frontend build.

## Reproduce the build

From a clean checkout:

```bash
cp .env.production.example .env.production.local
npm ci
NODE_OPTIONS=--max-old-space-size=8192 npm run build
```

`.env.production.local` is intentionally ignored. Compare it with the tracked
example before each release and never place secret values in either file.

The build must complete with environment validation enabled. Before release,
verify that `build/index.html`, `build/build-meta.json` and hashed files under
`build/assets/` exist.

## Hosting behavior

`firebase.json` provides:

- a single-page application fallback to `index.html`;
- no-store caching for HTML, service-worker and release metadata;
- immutable one-year caching for hashed assets;
- HSTS, content-type, frame, referrer and permissions headers;
- exclusion of source maps and local configuration from the upload.

No `.firebaserc` is tracked. This prevents a workstation default from silently
selecting production.

## Publish in an approved change window

Publishing changes external state. After the build has been reviewed and the
operator is authenticated to the intended Firebase account, use the explicit
project selector:

```bash
npx firebase-tools deploy \
  --only hosting \
  --project care-prod-jsgaviota-2608
```

Do not publish merely to test configuration. Use local build validation for
that. After an approved publication, verify the frontend URL, response headers,
API `/ping/`, application version and login policy.

## Clinical activation boundary

The hosted frontend is not authorization for real clinical use. Keep
`REACT_DISABLE_PATIENT_LOGIN=true` until the responsible operator approves and
tests the production authentication path. Enable Sentry only when both
`REACT_SENTRY_DSN` and `REACT_SENTRY_ENVIRONMENT` are supplied and the processor,
retention and PHI handling have been reviewed.
