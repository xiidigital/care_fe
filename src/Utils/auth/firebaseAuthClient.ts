/**
 * Thin boundary around the Firebase Web SDK (ADR-0010 §3).
 *
 * The SDK is imported dynamically so a build with Firebase disabled never pulls
 * it into the initial bundle, and a misconfigured build fails at the moment a
 * patient chooses the method rather than at page load.
 *
 * CARE never generates, stores or compares the SMS code or the email action
 * code. The only thing that leaves this module is a Firebase ID token, which is
 * handed to the CARE exchange once and then discarded along with the Firebase
 * session.
 */
import careConfig from "@careConfig";

import type {
  Auth,
  ConfirmationResult,
  RecaptchaVerifier,
  UserCredential,
} from "firebase/auth";

let authPromise: Promise<Auth> | null = null;

async function getFirebaseAuth(): Promise<Auth> {
  const { web } = careConfig.firebaseAuth;
  if (!careConfig.firebaseAuth.enabled || !web) {
    throw new Error("firebase_auth_unavailable");
  }

  authPromise ??= (async () => {
    const [{ initializeApp, getApps, getApp }, { getAuth }] = await Promise.all(
      [import("firebase/app"), import("firebase/auth")],
    );
    const app = getApps().length ? getApp() : initializeApp(web);
    return getAuth(app);
  })();

  return authPromise;
}

export async function createRecaptchaVerifier(
  containerId: string,
): Promise<RecaptchaVerifier> {
  const [auth, { RecaptchaVerifier: Verifier }] = await Promise.all([
    getFirebaseAuth(),
    import("firebase/auth"),
  ]);
  return new Verifier(auth, containerId, { size: "invisible" });
}

export async function sendVerificationSms(
  phoneNumber: string,
  verifier: RecaptchaVerifier,
): Promise<ConfirmationResult> {
  const [auth, { signInWithPhoneNumber }] = await Promise.all([
    getFirebaseAuth(),
    import("firebase/auth"),
  ]);
  return signInWithPhoneNumber(auth, phoneNumber, verifier);
}

export async function sendEmailSignInLink(email: string): Promise<void> {
  const [auth, { sendSignInLinkToEmail }] = await Promise.all([
    getFirebaseAuth(),
    import("firebase/auth"),
  ]);
  await sendSignInLinkToEmail(auth, email, {
    url: careConfig.firebaseAuth.emailLinkCallbackUrl,
    handleCodeInApp: true,
  });
}

export async function isEmailSignInLink(link: string): Promise<boolean> {
  const [auth, { isSignInWithEmailLink }] = await Promise.all([
    getFirebaseAuth(),
    import("firebase/auth"),
  ]);
  return isSignInWithEmailLink(auth, link);
}

export async function completeEmailSignIn(
  email: string,
  link: string,
): Promise<UserCredential> {
  const [auth, { signInWithEmailLink }] = await Promise.all([
    getFirebaseAuth(),
    import("firebase/auth"),
  ]);
  return signInWithEmailLink(auth, email, link);
}

/**
 * Take the ID token and end the Firebase session immediately. CARE's own
 * `PatientToken` is the only credential that outlives this call.
 */
export async function takeIdTokenAndSignOut(
  credential: UserCredential,
): Promise<string> {
  const idToken = await credential.user.getIdToken();
  try {
    const [auth, { signOut }] = await Promise.all([
      getFirebaseAuth(),
      import("firebase/auth"),
    ]);
    await signOut(auth);
  } catch {
    // Ending the provider session is hygiene, not correctness. The CARE token
    // has already been derived from evidence the backend re-verifies.
  }
  return idToken;
}
