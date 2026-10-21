import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { z } from "zod";
import { ApiError } from "../api/client";
import { safeNext, useAuth } from "../auth/AuthContext";
import { Alert, Button, Field, TextInput } from "../components/ui";
import { applyFieldErrors } from "../lib/forms";
import { loginSchema, registerSchema } from "../lib/validation";


function AuthCard({ title, subtitle, children }: { title: string; subtitle: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-5 pb-20 pt-8 sm:pt-14">
      <div className="card p-8">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-ink-soft">{subtitle}</p>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login, sessionExpired, signOutReason } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const signedOutEverywhere = signOutReason === "revoked";
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values.email, values.password);
      navigate(safeNext(params.get("next")), { replace: true });
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Sign-in failed. Please try again.");
    }
  });

  return (
    <AuthCard title="Welcome back" subtitle={<>New here? <Link to="/register" className="font-medium text-sage-700 underline underline-offset-4">Create an account</Link></>}>
      {signedOutEverywhere && !formError && <Alert tone="success" className="mb-6">You have been signed out of every session. Sign in again to continue.</Alert>}
      {sessionExpired && !signedOutEverywhere && !formError && <Alert tone="warning" className="mb-6">Your session ended. Please sign in again to continue.</Alert>}
      {formError && <Alert tone="danger" className="mb-6">{formError}</Alert>}
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <Field label="Email" error={errors.email?.message}>
          {(a) => <TextInput {...a} type="email" autoComplete="email" {...register("email")} />}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {(a) => <TextInput {...a} type="password" autoComplete="current-password" {...register("password")} />}
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Sign in</Button>
      </form>
    </AuthCard>
  );
}

export function RegisterPage() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await registerUser(values.fullName, values.email, values.password);
      navigate("/app/dashboard", { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.code === "EMAIL_IN_USE") {
        setError("email", { message: e.message });
      } else if (!applyFieldErrors(e, setError, ["fullName", "email", "password"])) {
        setFormError(e instanceof ApiError ? e.message : "Registration failed. Please try again.");
      }
    }
  });

  return (
    <AuthCard title="Create your account" subtitle={<>Already registered? <Link to="/login" className="font-medium text-sage-700 underline underline-offset-4">Sign in</Link></>}>
      {formError && <Alert tone="danger" className="mb-6">{formError}</Alert>}
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <Field label="Full name" error={errors.fullName?.message}>
          {(a) => <TextInput {...a} autoComplete="name" {...register("fullName")} />}
        </Field>
        <Field label="Email" error={errors.email?.message}>
          {(a) => <TextInput {...a} type="email" autoComplete="email" {...register("email")} />}
        </Field>
        <Field label="Password" error={errors.password?.message} hint="10–72 characters, with at least one letter and one number.">
          {(a) => <TextInput {...a} type="password" autoComplete="new-password" {...register("password")} />}
        </Field>
        <Field label="Confirm password" error={errors.confirmPassword?.message}>
          {(a) => <TextInput {...a} type="password" autoComplete="new-password" {...register("confirmPassword")} />}
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Create account</Button>
        <p className="text-center text-xs leading-relaxed text-muted">Your resume text and analyses are private to your account. You can delete everything at any time from account settings.</p>
      </form>
    </AuthCard>
  );
}
