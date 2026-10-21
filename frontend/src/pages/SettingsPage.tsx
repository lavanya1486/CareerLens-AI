import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { LogOut, ShieldAlert } from "lucide-react";
import type { z } from "zod";
import { ApiError } from "../api/client";
import { userApi } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import { ConfirmDialog, Dialog } from "../components/Dialog";
import { useToast } from "../components/Toast";
import { Alert, Button, Field, PageHeader, TextInput } from "../components/ui";
import { formatDate } from "../lib/format";
import { applyFieldErrors } from "../lib/forms";
import { passwordSchema, profileSchema } from "../lib/validation";

type ProfileValues = z.infer<typeof profileSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

function SettingsCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="card grid gap-6 p-6 md:grid-cols-[16rem_1fr] md:p-8" aria-label={title}>
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function ProfileForm() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting, isDirty } } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: user?.fullName ?? "", headline: user?.headline ?? "" },
  });
  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      const updated = await userApi.update({ fullName: v.fullName, headline: v.headline || null });
      setUser(updated);
      reset({ fullName: updated.fullName, headline: updated.headline ?? "" });
      toast.success("Profile updated.");
    } catch (e) {
      if (!applyFieldErrors(e, setError, ["fullName", "headline"])) setFormError(e instanceof ApiError ? e.message : "Saving failed.");
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Field label="Email" hint="Email changes are not supported. Create a new account to use a different address.">
        {(a) => <TextInput {...a} value={user?.email ?? ""} readOnly disabled />}
      </Field>
      <Field label="Full name" error={errors.fullName?.message}>{(a) => <TextInput {...a} autoComplete="name" {...register("fullName")} />}</Field>
      <Field label="Headline" optional hint="For example “Final-year CS student · Java & Spring”." error={errors.headline?.message}>
        {(a) => <TextInput {...a} maxLength={150} {...register("headline")} />}
      </Field>
      <div className="flex items-center justify-between gap-4 pt-2">
        <p className="text-xs text-muted">Member since {user ? formatDate(user.createdAt) : "—"}</p>
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save profile</Button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      await userApi.changePassword({ currentPassword: v.currentPassword, newPassword: v.newPassword });
      reset();
      toast.success("Password changed. Other sessions have been signed out.");
    } catch (e) {
      if (e instanceof ApiError && e.code === "INVALID_PASSWORD") setError("currentPassword", { message: "Current password is incorrect" });
      else if (e instanceof ApiError && e.code === "PASSWORD_UNCHANGED") setError("newPassword", { message: e.message });
      else if (!applyFieldErrors(e, setError, ["currentPassword", "newPassword"])) setFormError(e instanceof ApiError ? e.message : "Password change failed.");
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Field label="Current password" error={errors.currentPassword?.message}>{(a) => <TextInput {...a} type="password" autoComplete="current-password" {...register("currentPassword")} />}</Field>
      <Field label="New password" hint="10–72 characters with at least one letter and one number." error={errors.newPassword?.message}>
        {(a) => <TextInput {...a} type="password" autoComplete="new-password" {...register("newPassword")} />}
      </Field>
      <Field label="Confirm new password" error={errors.confirmPassword?.message}>{(a) => <TextInput {...a} type="password" autoComplete="new-password" {...register("confirmPassword")} />}</Field>
      <div className="flex justify-end pt-2"><Button type="submit" loading={isSubmitting}>Change password</Button></div>
    </form>
  );
}

function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { clearSession } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setPassword("");
    setError(null);
    onClose();
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return setError("Enter your password to confirm.");
    setBusy(true);
    setError(null);
    try {
      await userApi.deleteAccount(password);
      clearSession("deleted"); // the route guard sends the user to the landing page, which confirms deletion
    } catch (err) {
      setError(err instanceof ApiError && err.code === "INVALID_PASSWORD" ? "That password is incorrect." : err instanceof ApiError ? err.message : "Deletion failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={close} title="Delete your account permanently?" description="Your account, resumes, saved comparisons and reports are deleted immediately. This cannot be undone.">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Password" error={error ?? undefined}>{(a) => <TextInput {...a} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button type="submit" variant="danger" loading={busy}>Delete account</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function SettingsPage() {
  const { clearSession, user } = useAuth();
  const toast = useToast();
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const revoke = async () => {
    setRevoking(true);
    try {
      await userApi.revokeSessions();
      clearSession("revoked"); // the route guard sends the user to sign in, which explains what happened
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not sign out other sessions.");
      setRevoking(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Account" title="Settings" description="Manage your profile, password and data." />
      <div className="space-y-6">
        <SettingsCard title="Profile" description="Shown only to you inside CareerLens."><ProfileForm key={user?.id ?? "anonymous"} /></SettingsCard>
        <SettingsCard title="Password" description="Changing your password signs out every other session."><PasswordForm /></SettingsCard>
        <SettingsCard title="Sessions" description="Sessions last 60 minutes of activity. Sign out everywhere if you used a shared computer.">
          <Button variant="secondary" onClick={() => setConfirmRevoke(true)}><LogOut className="size-4" aria-hidden /> Sign out of all sessions</Button>
        </SettingsCard>
        <SettingsCard title="Your data" description="How CareerLens stores what you upload.">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
            <li>Uploaded PDF files are read in memory and never stored. Only the extracted text you review is saved.</li>
            <li>Unsaved analysis drafts are deleted automatically after 24 hours.</li>
            <li>Saved comparisons and resumes stay until you delete them or delete your account.</li>
            <li>Analysis runs on a self-hosted model. Your text is not sent to third-party AI services.</li>
          </ul>
        </SettingsCard>
        <section className="card border-clay-200 p-6 md:p-8" aria-label="Danger zone">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-3">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-clay-700" aria-hidden />
              <div>
                <h2 className="text-xl font-semibold">Delete account</h2>
                <p className="mt-1 text-sm text-muted">Permanently removes your account and every resume, comparison and report.</p>
              </div>
            </div>
            <Button variant="danger" onClick={() => setDeleting(true)}>Delete account</Button>
          </div>
        </section>
      </div>
      <ConfirmDialog open={confirmRevoke} title="Sign out of all sessions?" description="Every device, including this one, will be signed out. You will need to sign in again." confirmLabel="Sign out everywhere" onConfirm={revoke} onClose={() => setConfirmRevoke(false)} loading={revoking} />
      <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} />
    </>
  );
}
