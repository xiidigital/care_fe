import { Page, expect, test } from "@playwright/test";

/**
 * ADR-0011 / ES-11 browser journeys.
 *
 * The OIDC half no longer needs a specially built bundle. Providers are
 * described by the backend at runtime, so these tests stub that one response
 * and then assert what the browser *renders* and where it is *sent*. That is
 * also the honest scope: completing a login needs a real issuer, and this
 * suite deliberately has none.
 *
 * The Firebase journeys still need public build configuration, because
 * Firebase genuinely is build input. They stay gated:
 *
 *   REACT_FIREBASE_AUTH_ENABLED=true \
 *   REACT_FIREBASE_API_KEY=... REACT_FIREBASE_AUTH_DOMAIN=... \
 *   REACT_FIREBASE_PROJECT_ID=... REACT_FIREBASE_APP_ID=... \
 *   REACT_FIREBASE_EMAIL_LINK_CALLBACK_URL=http://localhost:4000/auth/firebase/email-callback \
 *   npx vite build --mode development
 */

const FIREBASE_ENABLED = process.env.CARE_E2E_EXTERNAL_AUTH === "enabled";

const AUTHORIZE =
  "https://identity.example/realms/care/protocol/openid-connect/auth";
const WORKFORCE_CALLBACK = "http://localhost:4000/auth/oidc/workforce/callback";
const PATIENT_CALLBACK = "http://localhost:4000/auth/oidc/patient/callback";

const PROVIDERS = [
  {
    id: "clinic-sso",
    display_name: "Clinic SSO",
    principal_type: "workforce",
    issuer: "https://identity.example/realms/care",
    client_id: "care-workforce",
    scopes: ["openid", "profile"],
    authorization_endpoint: AUTHORIZE,
    redirect_uri: WORKFORCE_CALLBACK,
  },
  {
    id: "patient-sso",
    display_name: "Patient SSO",
    principal_type: "patient",
    issuer: "https://identity.example/realms/care",
    client_id: "care-patient",
    scopes: ["openid"],
    authorization_endpoint: AUTHORIZE,
    redirect_uri: PATIENT_CALLBACK,
  },
];

async function stubProviders(page: Page, providers: unknown[] = PROVIDERS) {
  await page.route("**/api/v1/auth/providers/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(providers),
    }),
  );
}

const authorizationRequest = (page: Page) =>
  page.waitForRequest((r) => r.url().startsWith(AUTHORIZE));

test.describe("OIDC providers, described by the backend", () => {
  test("no configured provider leaves CARE's own login untouched", async ({
    page,
  }) => {
    await stubProviders(page, []);
    await page.goto("/login");

    await expect(
      page.getByRole("textbox", { name: /username/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^login$/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /continue with/i }),
    ).toHaveCount(0);
  });

  test("an unreachable provider list is not an error the patient sees", async ({
    page,
  }) => {
    await page.route("**/api/v1/auth/providers/", (route) => route.abort());
    await page.goto("/login");

    await expect(
      page.getByRole("textbox", { name: /username/i }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("each provider appears under the name its operator gave it", async ({
    page,
  }) => {
    await stubProviders(page);
    await page.goto("/login");

    await expect(
      page.getByRole("button", { name: /continue with clinic sso/i }),
    ).toBeVisible();
  });

  test("a patient provider is never offered on the staff form", async ({
    page,
  }) => {
    await stubProviders(page);
    await page.goto("/login");

    await expect(
      page.getByRole("button", { name: /continue with patient sso/i }),
    ).toHaveCount(0);
  });

  test("the provider name never predicts what happens inside it", async ({
    page,
  }) => {
    await stubProviders(page);
    await page.goto("/login");

    const body = (await page.locator("body").innerText()).toLowerCase();
    for (const word of ["passkey", "password reset", "federation", "ldap"]) {
      expect(body).not.toContain(word);
    }
  });

  test("the authorization request goes to the endpoint the backend gave", async ({
    page,
  }) => {
    // The whole point of ADR-0011 §2: this path is Keycloak's, and CARE only
    // knows it because the issuer said so. Composing it here would make CARE a
    // single-vendor client.
    await stubProviders(page);
    await page.goto("/login");

    const [request] = await Promise.all([
      authorizationRequest(page),
      page.getByRole("button", { name: /continue with clinic sso/i }).click(),
    ]);

    const url = new URL(request.url());
    expect(url.origin).toBe("https://identity.example");
    expect(url.pathname).toBe("/realms/care/protocol/openid-connect/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("care-workforce");
    expect(url.searchParams.get("scope")).toBe("openid profile");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("nonce")).toBeTruthy();
    expect(url.searchParams.get("redirect_uri")).toBe(WORKFORCE_CALLBACK);
    // The verifier stays in the browser.
    expect(url.searchParams.get("code_verifier")).toBeNull();
  });

  test("a provider CARE cannot safely redirect to is hidden", async ({
    page,
  }) => {
    await stubProviders(page, [
      { ...PROVIDERS[0], authorization_endpoint: "http://identity.example/a" },
    ]);
    await page.goto("/login");

    await expect(
      page.getByRole("button", { name: /continue with clinic sso/i }),
    ).toHaveCount(0);
  });

  test("each authorization request uses fresh state, nonce and challenge", async ({
    page,
  }) => {
    await stubProviders(page);
    const seen = new Set<string>();

    for (let attempt = 0; attempt < 2; attempt++) {
      await page.goto("/login");
      const [request] = await Promise.all([
        authorizationRequest(page),
        page.getByRole("button", { name: /continue with clinic sso/i }).click(),
      ]);
      const url = new URL(request.url());
      seen.add(
        [
          url.searchParams.get("state"),
          url.searchParams.get("nonce"),
          url.searchParams.get("code_challenge"),
        ].join("|"),
      );
    }

    expect(seen.size).toBe(2);
  });

  test("the patient choice uses the patient client and callback", async ({
    page,
  }) => {
    await stubProviders(page);
    await page.goto("/login?mode=patient");

    const [request] = await Promise.all([
      authorizationRequest(page),
      page.getByRole("button", { name: /continue with patient sso/i }).click(),
    ]);

    const url = new URL(request.url());
    expect(url.searchParams.get("client_id")).toBe("care-patient");
    expect(url.searchParams.get("redirect_uri")).toBe(PATIENT_CALLBACK);
  });

  test("a configured provider does not remove CARE's own phone OTP", async ({
    page,
  }) => {
    // A provider is one more way in, never a replacement. Retiring the CARE
    // code is a separate operator decision.
    await stubProviders(page);
    await page.goto("/login?mode=patient");

    await expect(
      page.getByRole("button", { name: /continue with a care code/i }),
    ).toBeVisible();
  });
});

test.describe("Firebase patient login", () => {
  test.skip(
    !FIREBASE_ENABLED,
    "Set CARE_E2E_EXTERNAL_AUTH=enabled and serve a build with Firebase configured.",
  );

  test("the patient entry offers SMS and email beside the CARE code", async ({
    page,
  }) => {
    await stubProviders(page, []);
    await page.goto("/login?mode=patient");

    await expect(
      page.getByRole("button", { name: /continue by sms/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /continue by email/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /continue with a care code/i }),
    ).toBeVisible();
  });

  test("choosing SMS discloses the Google processing notice", async ({
    page,
  }) => {
    await stubProviders(page, []);
    await page.goto("/login?mode=patient");
    await page.getByRole("button", { name: /continue by sms/i }).click();

    await expect(page.getByText(/google receives and stores/i)).toBeVisible();
    await expect(page.getByPlaceholder(/enter phone number/i)).toBeVisible();
  });

  test("an out-of-policy number cannot start the SMS flow", async ({
    page,
  }) => {
    await stubProviders(page, []);
    await page.goto("/login?mode=patient");
    await page.getByRole("button", { name: /continue by sms/i }).click();

    await page.getByPlaceholder(/enter phone number/i).fill("+919999999999");

    await expect(
      page.getByText(/only for numbers starting with/i),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /continue by sms/i }),
    ).toBeDisabled();
  });
});
