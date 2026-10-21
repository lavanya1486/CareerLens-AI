import { describe, expect, it } from "vitest";
import type { JobRequirements } from "../api/types";
import { safeNext } from "../auth/AuthContext";
import { comparisonFixture } from "../test/utils";
import { readQuery } from "./comparisonQuery";
import { formatScore, plural, slug } from "./format";
import { MAX_REQUIREMENTS, toEditable } from "./requirements";
import { jobDescriptionSchema, passwordSchema, registerSchema, resumeTextSchema, validatePdfFile, wordCount } from "./validation";

describe("validation schemas mirror the backend rules", () => {
  const base = { fullName: "Ananya Rao", email: "ananya@example.com", password: "Synthetic2026", confirmPassword: "Synthetic2026" };

  it("accepts a valid registration", () => {
    expect(registerSchema.safeParse(base).success).toBe(true);
  });

  it.each([
    ["short1", "Use at least 10 characters"],
    ["onlyletterspassword", "Include at least one number"],
    ["1234567890", "Include at least one letter"],
    ["a1".repeat(37), "Use at most 72 characters"],
  ])("rejects password %s", (password, message) => {
    const result = registerSchema.safeParse({ ...base, password, confirmPassword: password });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain(message);
  });

  it("requires matching confirmation", () => {
    const result = registerSchema.safeParse({ ...base, confirmPassword: "Different2026" });
    expect(result.error?.issues[0]).toMatchObject({ path: ["confirmPassword"], message: "Passwords do not match" });
  });

  it("applies the same rules when changing a password", () => {
    expect(passwordSchema.safeParse({ currentPassword: "x", newPassword: "short", confirmPassword: "short" }).success).toBe(false);
    expect(passwordSchema.safeParse({ currentPassword: "x", newPassword: "Newpassword7", confirmPassword: "Newpassword7" }).success).toBe(true);
  });

  it("enforces resume and job description length limits after trimming", () => {
    expect(resumeTextSchema.safeParse({ title: "CV", content: `   ${"a".repeat(149)}   ` }).success).toBe(false);
    expect(resumeTextSchema.safeParse({ title: "CV", content: "a".repeat(150) }).success).toBe(true);
    expect(jobDescriptionSchema.safeParse({ jobTitle: "", company: "", jobDescription: "x".repeat(99) }).success).toBe(false);
    expect(jobDescriptionSchema.safeParse({ jobTitle: "", company: "", jobDescription: "x".repeat(20_001) }).success).toBe(false);
  });

  it("pre-checks PDF files without trusting them (server re-validates magic bytes)", () => {
    expect(validatePdfFile(new File(["x"], "cv.docx"))).toMatch(/only pdf/i);
    expect(validatePdfFile(new File([], "cv.pdf"))).toMatch(/empty/i);
    expect(validatePdfFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "cv.PDF"))).toMatch(/larger than 5 MB/);
    expect(validatePdfFile(new File(["%PDF"], "cv.pdf"))).toBeNull();
  });

  it("counts words", () => {
    expect(wordCount("  Built   REST APIs\nwith Spring ")).toBe(5);
    expect(wordCount("   ")).toBe(0);
  });
});

describe("safeNext only allows in-app redirects after sign-in", () => {
  it.each([
    ["/app/comparisons/1?x=2", "/app/comparisons/1?x=2"],
    ["/app", "/app"],
    ["https://evil.example/app", "/app/dashboard"],
    ["//evil.example/app", "/app/dashboard"],
    ["/appevil", "/app/dashboard"],
    ["/app/\\evil.example", "/app/dashboard"],
    [null, "/app/dashboard"],
  ])("%s -> %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});

describe("readQuery", () => {
  it("parses URL filters and ignores invalid numbers", () => {
    const q = readQuery(new URLSearchParams("q=java&minScore=40&maxScore=abc&page=2&sort=overallScore,desc&from=2026-10-01"));
    expect(q).toEqual({ q: "java", jobTitle: undefined, minScore: 40, maxScore: undefined, from: "2026-10-01", to: undefined, sort: "overallScore,desc", page: 2, size: 10 });
  });

  it("defaults to newest first, first page", () => {
    expect(readQuery(new URLSearchParams())).toMatchObject({ sort: "createdAt,desc", page: 0 });
  });
});

describe("toEditable", () => {
  it("keeps extracted skills, importance and alternatives with unique keys", () => {
    const job = comparisonFixture.result.requirements as JobRequirements;
    const items = toEditable(job);
    expect(items).toHaveLength(job.skills.length);
    expect(items.length).toBeLessThanOrEqual(MAX_REQUIREMENTS);
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
    expect(items[0]).toMatchObject({ skill: job.skills[0]?.skill, importance: job.skills[0]?.importance, alternatives: job.skills[0]?.alternatives });
  });
});

describe("format helpers", () => {
  it("formats scores and handles missing values", () => {
    expect(formatScore(62.84)).toBe("63");
    expect(formatScore(62.84, 1)).toBe("62.8");
    expect(formatScore(null)).toBe("—");
  });

  it("pluralises", () => {
    expect(plural(1, "saved comparison")).toBe("1 saved comparison");
    expect(plural(3, "saved comparison")).toBe("3 saved comparisons");
  });

  it("slugifies", () => {
    expect(slug("Java Backend Intern @ Northwind Labs!")).toMatch(/^java-backend-intern-northwind-labs$/);
  });
});
