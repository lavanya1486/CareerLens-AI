import { download, request } from "./client";
import type {
  ComparisonDetail,
  ComparisonQuery,
  ComparisonSummary,
  Dashboard,
  JobRequirements,
  Page,
  RequirementInput,
  ResumeDetail,
  ResumeSummary,
  SystemStatus,
  User,
} from "./types";

export const authApi = {
  me: () => request<User>("/users/me", { silentUnauthorized: true }),
  register: (body: { fullName: string; email: string; password: string }) =>
    request<User>("/auth/register", { method: "POST", body, silentUnauthorized: true }),
  login: (body: { email: string; password: string }) =>
    request<User>("/auth/login", { method: "POST", body, silentUnauthorized: true }),
  logout: () => request<void>("/auth/logout", { method: "POST", silentUnauthorized: true }),
};

export const userApi = {
  update: (body: { fullName: string; headline: string | null }) => request<User>("/users/me", { method: "PATCH", body }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<void>("/users/me/password", { method: "POST", body }),
  revokeSessions: () => request<void>("/users/me/sessions/revoke", { method: "POST" }),
  deleteAccount: (password: string) => request<void>("/users/me", { method: "DELETE", body: { password } }),
};

export const resumeApi = {
  list: () => request<ResumeSummary[]>("/resumes"),
  get: (id: string) => request<ResumeDetail>(`/resumes/${id}`),
  upload: (file: File, title?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);
    return request<ResumeDetail>("/resumes/upload", { method: "POST", form, timeoutMs: 60_000 });
  },
  createFromText: (body: { title: string; content: string }) =>
    request<ResumeDetail>("/resumes", { method: "POST", body, timeoutMs: 45_000 }),
  update: (id: string, body: { title: string; content: string }) =>
    request<ResumeDetail>(`/resumes/${id}`, { method: "PUT", body, timeoutMs: 45_000 }),
  remove: (id: string) => request<void>(`/resumes/${id}`, { method: "DELETE" }),
};

export const jobApi = {
  extract: (jobDescription: string) =>
    request<JobRequirements>("/job-descriptions/extract", { method: "POST", body: { jobDescription }, timeoutMs: 45_000 }),
};

export const analysisApi = {
  run: (
    body: {
      resumeId: string;
      jobDescription: string;
      jobTitle?: string;
      company?: string;
      requirements?: RequirementInput[];
    },
    signal?: AbortSignal,
  ) => request<ComparisonDetail>("/analyses", { method: "POST", body, timeoutMs: 120_000, signal }),
};

export const comparisonApi = {
  list: (query: ComparisonQuery) =>
    request<Page<ComparisonSummary>>("/comparisons", { query: query as Record<string, string | number | undefined> }),
  get: (id: string) => request<ComparisonDetail>(`/comparisons/${id}`),
  update: (id: string, body: { name?: string; jobTitle?: string; company?: string; saved?: boolean }) =>
    request<ComparisonDetail>(`/comparisons/${id}`, { method: "PATCH", body }),
  remove: (id: string) => request<void>(`/comparisons/${id}`, { method: "DELETE" }),
  downloadPdf: (id: string) => download(`/comparisons/${id}/report.pdf`, "careerlens-report.pdf", "application/pdf"),
  downloadJson: (id: string) => download(`/comparisons/${id}/export.json`, "careerlens-comparison.json", "application/json"),
};

export const dashboardApi = {
  get: () => request<Dashboard>("/dashboard"),
};

export const systemApi = {
  status: () => request<SystemStatus>("/system/status", { silentUnauthorized: true, timeoutMs: 10_000 }),
};
