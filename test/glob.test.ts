import { describe, expect, test } from "bun:test";
import { matchGlob, normalizePath } from "../src/glob";

describe("normalizePath", () => {
  test("converts backslashes and strips ./", () => {
    expect(normalizePath("src\\generated\\x.ts")).toBe("src/generated/x.ts");
    expect(normalizePath("./src/a.ts")).toBe("src/a.ts");
  });
});

describe("matchGlob", () => {
  test("exact match", () => {
    expect(matchGlob("src/a.ts", "src/a.ts")).toBe(true);
    expect(matchGlob("src/a.ts", "src/b.ts")).toBe(false);
  });

  test("* stays within one segment", () => {
    expect(matchGlob("src/*.ts", "src/a.ts")).toBe(true);
    expect(matchGlob("src/*.ts", "src/sub/a.ts")).toBe(false);
    expect(matchGlob("*.env", ".env")).toBe(true);
    expect(matchGlob("src/*/x", "src/a/x")).toBe(true);
  });

  test("** crosses directory boundaries", () => {
    expect(matchGlob("**/generated/**", "src/generated/models.ts")).toBe(true);
    expect(matchGlob("**/generated/**", "src/feature/generated/models.ts")).toBe(true);
    expect(matchGlob("**/generated/**", "generated/models.ts")).toBe(true);
    expect(matchGlob("src/**/x.ts", "src/x.ts")).toBe(true);
    expect(matchGlob("src/**/x.ts", "src/a/b/x.ts")).toBe(true);
    expect(matchGlob("src/**/x.ts", "src/a/b/y.ts")).toBe(false);
  });

  test("? matches a single character", () => {
    expect(matchGlob("file?.txt", "file1.txt")).toBe(true);
    expect(matchGlob("file?.txt", "file12.txt")).toBe(false);
  });

  test("case insensitive option", () => {
    expect(matchGlob("SRC/A.TS", "src/a.ts", true)).toBe(true);
    expect(matchGlob("SRC/A.TS", "src/a.ts", false)).toBe(false);
  });

  test("windows paths match after normalization", () => {
    expect(matchGlob("src/**", "src\\generated\\x.ts")).toBe(true);
  });
});
