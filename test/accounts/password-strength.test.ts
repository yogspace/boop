import { describe, expect, it } from "vitest";
import {
  checkPassword,
  type Owner,
  STRONG_LENGTH,
} from "../../src/features/accounts/password-strength";

/** The reason a password gets a warning – or "ok". */
const reasonOf = (password: string, owner?: Owner) => {
  const check = checkPassword(password, owner);
  return check.ok ? "ok" : check.reason;
};

const ANNA: Owner = { name: "Anna", email: "anna.schmidt90@example.com" };

const all = (passwords: string[], owner?: Owner) =>
  Object.fromEntries(passwords.map((p) => [p, reasonOf(p, owner)]));

const each = (passwords: string[], reason: string) =>
  Object.fromEntries(passwords.map((p) => [p, reason]));

describe("a new password", () => {
  it("is fine when long and nothing anyone tries first", () => {
    const fine = [
      "Kalender-Stempel-Wolke",
      "korrekt pferd batterie",
      "Mondschein-Gießkanne",
      "correcthorsebatterystaple",
      "Xk9#mQ2$pL",
      "Zuckerwatte42",
      "Studentenfutter",
    ];
    expect(all(fine, ANNA)).toEqual(each(fine, "ok"));
  });

  it(`is short under ${STRONG_LENGTH} characters`, () => {
    expect(STRONG_LENGTH).toBe(8);
    const short = ["", "Wurstbr", "Q!w2E#r", "Mx7&kd"];
    expect(all(short)).toEqual(each(short, "short"));
    expect(reasonOf("Wurstbrot")).toBe("ok");
  });

  it("is common when on the list – capitals, ends and stand-ins no way out", () => {
    const common = [
      "passwort",
      "PASSWORT",
      "Passwort123!",
      "hallo123",
      "Hallo1234!!",
      "password1",
      "P@ssw0rd",
      "h4ll0",
      "4dmin!",
      "!!Sommer2024",
      "Sonnenschein2024",
      "ichliebedich",
      "1qaz2wsx",
      "Schalke04",
    ];
    expect(all(common)).toEqual(each(common, "common"));
  });

  it("is not common once enough else comes with the listed word", () => {
    expect(reasonOf("hallo8#4!92&5%1")).toBe("ok");
    expect(reasonOf("Sommerregen-im-Garten")).toBe("ok");
  });

  it("is a pattern when it repeats or runs along the keys", () => {
    const patterns = [
      "aaaaaa",
      "aaaaaaaaaaaa1",
      "123456",
      "9876543210",
      "abcdef",
      "zyxwvuts",
      "qwertz",
      "qwertzuiop",
      "asdfghjkl",
      "!@#$%^&*()",
      "abcabcabc",
      "hallohallo",
      "Abcdef!!",
    ];
    expect(all(patterns)).toEqual(each(patterns, "pattern"));
  });

  it("is only digits, or a date", () => {
    const digits = ["4829103756", "1990", "01.01.1990", "31-12-2024"];
    expect(all(digits)).toEqual(each(digits, "digits"));
  });

  it("is personal with the name or the address in it, and little else", () => {
    const personal = [
      "anna1990",
      "Anna2024!",
      "schmidt90",
      "AnnaSchmidt",
      "Schmidt-Anna-1990",
      "anna123456",
    ];
    expect(all(personal, ANNA)).toEqual(each(personal, "personal"));
    // Long enough without her.
    expect(reasonOf("Anna-Gießkanne-Mondschein", ANNA)).toBe("ok");
    // Not knowing whose it is, a name is just a common one.
    expect(reasonOf("anna1990")).toBe("common");
    // Two letters are in too many words to count.
    expect(reasonOf("Jo-Gießkanne-Mond", { name: "Jo" })).toBe("ok");
  });

  it("is boop with “boop” and little else", () => {
    const boop = ["boop", "Boop2024!", "b00p1234", "booopbooop", "BOOP-boop"];
    expect(all(boop)).toEqual(each(boop, "boop"));
    expect(reasonOf("Boop-Wolke-Gießkanne")).toBe("ok");
  });
});
