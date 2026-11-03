import { describe, expect, it } from "@rstest/core";
import { hashPassword, verifyPassword, weakPassword } from "../src/auth/password.js";
import { hashToken, newRecoveryCode, normaliseRecoveryCode } from "../src/auth/tokens.js";
import { acceptedStep, base32, codeFor, otpauthUri, stepAt } from "../src/auth/totp.js";

describe("passwords", () => {
  it("verifies the password it hashed, and nothing else", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterY", hash)).toBe(false);
    expect(await verifyPassword("anything", "not a hash")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same password")).not.toBe(await hashPassword("same password"));
  });

  it("refuses common passwords, the username and one character repeated", () => {
    expect(weakPassword("Password1234", "aminah")).toMatch(/first ones guessed/);
    expect(weakPassword("aminah-is-great", "aminah")).toMatch(/username/);
    expect(weakPassword("zzzzzzzzzzzz", "aminah")).toMatch(/over and over/);
    expect(weakPassword("lembu makan rumput", "aminah")).toBeUndefined();
  });
});

describe("TOTP", () => {
  // RFC 6238 appendix B: the SHA-1 secret "12345678901234567890".
  const secret = base32(Buffer.from("12345678901234567890"));

  it("gives the RFC 6238 test values", () => {
    expect(codeFor(secret, stepAt(59_000))).toBe("287082");
    expect(codeFor(secret, stepAt(1_111_111_109_000))).toBe("081804");
    expect(codeFor(secret, stepAt(1_234_567_890_000))).toBe("005924");
    expect(codeFor(secret, stepAt(20_000_000_000_000))).toBe("353130");
  });

  it("accepts one step either side of now, and no further", () => {
    const now = 1_234_567_890_000;
    const step = stepAt(now);
    expect(acceptedStep(secret, codeFor(secret, step - 1), null, now)).toBe(step - 1);
    expect(acceptedStep(secret, codeFor(secret, step + 1), null, now)).toBe(step + 1);
    expect(acceptedStep(secret, codeFor(secret, step - 2), null, now)).toBeUndefined();
    expect(acceptedStep(secret, "12345", null, now)).toBeUndefined();
  });

  it("refuses a code whose step was already used", () => {
    const now = 1_234_567_890_000;
    const step = stepAt(now);
    expect(acceptedStep(secret, codeFor(secret, step), step, now)).toBeUndefined();
  });

  it("writes an address authenticator apps read", () => {
    expect(otpauthUri("ABC", "aminah", "Laman Agensi")).toBe(
      "otpauth://totp/Laman%20Agensi%3Aaminah?secret=ABC&issuer=Laman+Agensi&algorithm=SHA1&digits=6&period=30",
    );
  });
});

describe("tokens", () => {
  it("hashes the same token the same way", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toHaveLength(64);
  });

  it("matches a recovery code however it's typed", () => {
    const code = newRecoveryCode();
    expect(code).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    expect(normaliseRecoveryCode(` ${code.toLowerCase().replace("-", " ")} `)).toBe(
      normaliseRecoveryCode(code),
    );
  });
});
