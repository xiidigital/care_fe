import { expect, test } from "@playwright/test";

/**
 * ADR-0010 / ES-10 dev acceptance, enabled configuration.
 *
 * These journeys need a build whose public configuration turns the providers
 * on, which is not the shipped default. They are skipped unless the runner
 * says the app under test was built that way:
 *
 *   REACT_FIREBASE_AUTH_ENABLED=true \
 *   REACT_FIREBASE_API_KEY=... REACT_FIREBASE_AUTH_DOMAIN=... \
 *   REACT_FIREBASE_PROJECT_ID=... REACT_FIREBASE_APP_ID=... \
 *   REACT_FIREBASE_EMAIL_LINK_CALLBACK_URL=http://localhost:4000/auth/firebase/email-callback \
 *   REACT_KEYCLOAK_ENABLED=true REACT_KEYCLOAK_ISSUER_URL=https://identity.example/realms/care \
 *   REACT_KEYCLOAK_WORKFORCE_CLIENT_ID=care-workforce \
 *   REACT_KEYCLOAK_PATIENT_CLIENT_ID=care-patient \
 *   REACT_KEYCLOAK_WORKFORCE_REDIRECT_URI=http://localhost:4000/auth/keycloak/workforce/callback \
 *   REACT_KEYCLOAK_PATIENT_REDIRECT_URI=http://localhost:4000/auth/keycloak/patient/callback \
 *   npx vite build --mode development
 *
 * They assert what is *rendered* and where the browser is *sent*. They never
 * complete a login: that needs a real Firebase project and a real Keycloak
 * server, neither of which exists.
 */

const ENABLED = process.env.CARE_E2E_EXTERNAL_AUTH === "enabled";

test.describe("External authentication, enabled configuration", () => {
  test.skip(
    !ENABLED,
    "Set CARE_E2E_EXTERNAL_AUTH=enabled and serve a build with the providers configured.",
  );

  test("the patient entry offers SMS, email and the Keycloak choice", async ({
    page,
  }) => {
    await page.goto("/login?mode=patient");

    await expect(
      page.getByRole("button", { name: /continue by sms/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /continue by email/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /use another login method/i }),
    ).toBeVisible();
  });

  test("enabling Firebase does not remove CARE's own phone OTP", async ({
    page,
  }) => {
    await page.goto("/login?mode=patient");

    // Firebase is an additional way in, never a replacement. The existing CARE
    // code path stays on offer until an operator switches it off deliberately.
    await expect(
      page.getByRole("button", { name: /continue with a care code/i }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: /continue with a care code/i })
      .click();
    await expect(page.getByPlaceholder(/enter phone number/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /send otp/i })).toBeVisible();
  });

  test("the Keycloak choice names no mechanism configured inside Keycloak", async ({
    page,
  }) => {
    await page.goto("/login?mode=patient");

    const body = await page.locator("body").innerText();
    for (const word of ["passkey", "password reset", "federation", "LDAP"]) {
      expect(body.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });

  test("choosing SMS discloses the Google processing notice", async ({
    page,
  }) => {
    await page.goto("/login?mode=patient");
    await page.getByRole("button", { name: /continue by sms/i }).click();

    await expect(page.getByText(/google receives and stores/i)).toBeVisible();
    await expect(page.getByPlaceholder(/enter phone number/i)).toBeVisible();
  });

  test("an out-of-policy number cannot start the SMS flow", async ({
    page,
  }) => {
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

  test("the staff form keeps password login and adds the Keycloak action", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("textbox", { name: /username/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^login$/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /organization account/i }),
    ).toBeVisible();
  });

  test("the workforce Keycloak action starts a correct PKCE authorization", async ({
    page,
  }) => {
    await page.goto("/login");

    // The issuer does not exist, so the navigation fails -- the assertion is
    // about the request CARE makes, not about any provider response.
    const [request] = await Promise.all([
      page.waitForRequest((r) =>
        r.url().includes("/protocol/openid-connect/auth"),
      ),
      page.getByRole("button", { name: /organization account/i }).click(),
    ]);

    const url = new URL(request.url());
    expect(url.origin).toBe("https://identity.example");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("care-workforce");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("nonce")).toBeTruthy();
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:4000/auth/keycloak/workforce/callback",
    );
    // The verifier stays in the browser.
    expect(url.searchParams.get("code_verifier")).toBeNull();
  });

  test("the patient Keycloak choice uses the patient client and callback", async ({
    page,
  }) => {
    await page.goto("/login?mode=patient");

    const [request] = await Promise.all([
      page.waitForRequest((r) =>
        r.url().includes("/protocol/openid-connect/auth"),
      ),
      page.getByRole("button", { name: /use another login method/i }).click(),
    ]);

    const url = new URL(request.url());
    expect(url.searchParams.get("client_id")).toBe("care-patient");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:4000/auth/keycloak/patient/callback",
    );
  });

  test("each authorization request uses fresh state, nonce and challenge", async ({
    page,
  }) => {
    const seen = new Set<string>();

    for (let attempt = 0; attempt < 2; attempt++) {
      await page.goto("/login");
      const [request] = await Promise.all([
        page.waitForRequest((r) =>
          r.url().includes("/protocol/openid-connect/auth"),
        ),
        page.getByRole("button", { name: /organization account/i }).click(),
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
});
