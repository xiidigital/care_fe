import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  forgetEmailForSignIn,
  rememberEmailForSignIn,
  takeEmailForSignIn,
  withoutEmailLinkParams,
} from "@/Utils/auth/emailLinkState";

class MemoryStorage implements Storage {
  private entries = new Map<string, string>();
  get length() {
    return this.entries.size;
  }
  clear() {
    this.entries.clear();
  }
  getItem(key: string) {
    return this.entries.get(key) ?? null;
  }
  key(index: number) {
    return [...this.entries.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.entries.delete(key);
  }
  setItem(key: string, value: string) {
    this.entries.set(key, value);
  }
}

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
});

test("the remembered address is normalized and single-use", () => {
  rememberEmailForSignIn("  Patient@Example.COM ", storage);

  assert.equal(takeEmailForSignIn(storage), "patient@example.com");
  assert.equal(takeEmailForSignIn(storage), null);
});

test("opening the link on another device simply has no remembered address", () => {
  assert.equal(takeEmailForSignIn(storage), null);
});

test("a blank remembered address is treated as absent", () => {
  storage.setItem("care_email_link_address", "   ");

  assert.equal(takeEmailForSignIn(storage), null);
});

test("the address can be abandoned without being used", () => {
  rememberEmailForSignIn("patient@example.com", storage);
  forgetEmailForSignIn(storage);

  assert.equal(takeEmailForSignIn(storage), null);
});

test("firebase action parameters are removed from the address bar", () => {
  const cleaned = withoutEmailLinkParams(
    "https://care.example/auth/firebase/email-callback" +
      "?apiKey=public-key&oobCode=SECRET-ACTION-CODE&mode=signIn&lang=en",
  );

  assert.equal(cleaned, "/auth/firebase/email-callback");
  assert.equal(cleaned.includes("oobCode"), false);
  assert.equal(cleaned.includes("SECRET-ACTION-CODE"), false);
});

test("unrelated query parameters survive the cleanup", () => {
  const cleaned = withoutEmailLinkParams(
    "https://care.example/auth/firebase/email-callback?oobCode=x&redirect=%2Fpatient%2Fhome",
  );

  assert.equal(
    cleaned,
    "/auth/firebase/email-callback?redirect=%2Fpatient%2Fhome",
  );
});

test("an unparseable href degrades to the site root", () => {
  assert.equal(withoutEmailLinkParams("not a url"), "/");
});
