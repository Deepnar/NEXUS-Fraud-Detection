import { describe, expect, it } from "vitest";
import { formatPhoneDisplay, normalizePhone, phonesMatch } from "../phone";

describe("normalizePhone", () => {
  it("strips formatting and adds the default country code for bare numbers", () => {
    expect(normalizePhone("9876543210")).toBe("919876543210");
    expect(normalizePhone("+91 98765 43210")).toBe("919876543210");
    expect(normalizePhone("+1 (415) 555-2671")).toBe("14155552671");
    expect(normalizePhone("0091 98765 43210")).toBe("919876543210");
    expect(normalizePhone("0919876543210")).toBe("919876543210");
  });
});

describe("phonesMatch", () => {
  it("matches equivalent formats", () => {
    expect(phonesMatch("919876543210", "+91 98765 43210")).toBe(true);
    expect(phonesMatch("9876543210", "919876543210")).toBe(true);
    expect(phonesMatch("+1 415 555 2671", "14155552671")).toBe(true);
  });

  it("does not match different numbers", () => {
    expect(phonesMatch("919876543210", "919876543211")).toBe(false);
    expect(phonesMatch("9876543210", "9876543211")).toBe(false);
    expect(phonesMatch("", "919876543210")).toBe(false);
  });
});

describe("formatPhoneDisplay", () => {
  it("formats Indian numbers readably", () => {
    expect(formatPhoneDisplay("919876543210")).toBe("+91 98765 43210");
    expect(formatPhoneDisplay("14155552671")).toBe("+14155552671");
  });
});
