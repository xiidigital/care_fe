import { expect, test } from "@playwright/test";

/**
 * ADR-0010 / ES-10: both external providers are disabled by default.
 *
 * These journeys assert the *dormant* state, which is the one that actually
 * ships. They prove that nothing about the prepared integration is visible or
 * reachable, and that existing CARE login is untouched by its presence.
 *
 * A build with a provider enabled is covered by the unit suite
 * (`src/Utils/auth/__tests__`), because enabling one here would require a live
 * Firebase project or a Keycloak server -- neither of which exists, and
 * neither of which ES-10 permits us to stand up.
 */

test.describe("External authentication is dormant by default", () => {
  test("the staff login form offers no Keycloak action", async ({ page }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("textbox", { name: /username/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /login/i })).toBeVisible();

    await expect(
      page.getByRole("button", { name: /organization account/i }),
    ).toHaveCount(0);
  });

  test("the patient tab offers no external choice", async ({ page }) => {
    await page.goto("/login?mode=patient");
    await expect(page.getByPlaceholder(/enter phone number/i)).toBeVisible();

    await expect(
      page.getByRole("button", { name: /continue by sms/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /continue by email/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /use another login method/i }),
    ).toHaveCount(0);
  });

  test("the legacy patient phone OTP path is unchanged", async ({ page }) => {
    await page.goto("/login?mode=patient");

    await expect(page.getByPlaceholder(/enter phone number/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /send otp/i })).toBeVisible();
  });

  test("no provider SDK or issuer is contacted while disabled", async ({
    page,
  }) => {
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (
        /identitytoolkit|securetoken|firebaseapp\.com|googleapis\.com\/identitytoolkit|\/realms\//.test(
          url,
        )
      ) {
        externalRequests.push(url);
      }
    });

    await page.goto("/login?mode=patient");
    await expect(page.getByPlaceholder(/enter phone number/i)).toBeVisible();
    await page.waitForTimeout(2000);

    expect(externalRequests).toEqual([]);
  });

  test("a Keycloak callback without a local transaction fails closed", async ({
    page,
  }) => {
    await page.goto(
      "/auth/keycloak/workforce/callback?code=forged-code&state=forged-state",
    );

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /back to login/i }),
    ).toBeVisible();
  });

  test("the callback strips the provider response from the address bar", async ({
    page,
  }) => {
    await page.goto(
      "/auth/keycloak/patient/callback?code=single-use-code&state=abc",
    );

    await expect(page.getByRole("alert")).toBeVisible();
    expect(page.url()).not.toContain("single-use-code");
    expect(page.url()).not.toContain("state=");
  });

  test("a forged callback never reaches the CARE exchange endpoint", async ({
    page,
  }) => {
    const exchangeCalls: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/auth/")) {
        exchangeCalls.push(request.url());
      }
    });

    await page.goto(
      "/auth/keycloak/workforce/callback?code=forged&state=forged",
    );
    await expect(page.getByRole("alert")).toBeVisible();

    expect(exchangeCalls).toEqual([]);
  });
});
