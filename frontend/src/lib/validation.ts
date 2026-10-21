import { z } from "zod";

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const RESUME_MIN_CHARS = 150;
export const RESUME_MAX_CHARS = 40_000;
export const JD_MIN_CHARS = 100;
export const JD_MAX_CHARS = 20_000;

export const resumeTextSchema = z.object({
  title: z.string().trim().min(1, "Give this resume a title").max(120, "Title must be at most 120 characters"),
  content: z
    .string()
    .trim()
    .min(RESUME_MIN_CHARS, `Resume text must be at least ${RESUME_MIN_CHARS} characters`)
    .max(RESUME_MAX_CHARS, `Resume text must be at most ${RESUME_MAX_CHARS.toLocaleString()} characters`),
});
export type ResumeTextValues = z.infer<typeof resumeTextSchema>;

export const jobDescriptionSchema = z.object({
  jobTitle: z.string().trim().max(150, "Job title must be at most 150 characters"),
  company: z.string().trim().max(150, "Company must be at most 150 characters"),
  jobDescription: z
    .string()
    .trim()
    .min(JD_MIN_CHARS, `Paste the full job description (at least ${JD_MIN_CHARS} characters)`)
    .max(JD_MAX_CHARS, `Job description must be at most ${JD_MAX_CHARS.toLocaleString()} characters`),
});
export type JobDescriptionValues = z.infer<typeof jobDescriptionSchema>;

/** Client-side checks mirror the server; the server re-validates everything including magic bytes. */
export function validatePdfFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".pdf")) return "Only PDF files are supported. Choose a .pdf file or paste your resume text.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_PDF_BYTES) return "This PDF is larger than 5 MB. Export a smaller version or paste the text instead.";
  return null;
}

export function wordCount(text: string) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required").max(72, "Password is too long"),
});

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(1, "Name is required").max(100, "Name must be at most 100 characters"),
    email: z.string().trim().min(1, "Email is required").email("Enter a valid email address").max(254),
    password: z
      .string()
      .min(10, "Use at least 10 characters")
      .max(72, "Use at most 72 characters")
      .regex(/[A-Za-z]/, "Include at least one letter")
      .regex(/\d/, "Include at least one number"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

export const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(100, "Name must be at most 100 characters"),
  headline: z.string().trim().max(150, "Headline must be at most 150 characters"),
});

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z
      .string()
      .min(10, "Use at least 10 characters")
      .max(72, "Use at most 72 characters")
      .regex(/[A-Za-z]/, "Include at least one letter")
      .regex(/\d/, "Include at least one number"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });
