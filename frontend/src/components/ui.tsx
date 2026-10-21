import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes,
  type TextareaHTMLAttributes, useId } from "react";
import { Link, type LinkProps } from "react-router";
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { cn } from "../lib/format";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-sage-700 text-paper hover:bg-sage-800 shadow-sm",
  secondary: "bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-sage-50",
  ghost: "text-ink-soft hover:bg-sage-50 hover:text-ink",
  danger: "bg-clay-700 text-white hover:bg-clay-500",
  accent: "bg-mustard-300 text-ink hover:bg-mustard-200 shadow-sm",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

// eslint-disable-next-line react-refresh/only-export-components -- shared with LinkButton-like anchors
export function buttonClasses(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({ variant = "primary", size = "md", className, ...rest }: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClasses(variant, size, className)} {...rest} />;
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
  className?: string;
  optional?: boolean;
}

export function Field({ label, error, hint, children, className, optional }: FieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between text-sm font-medium text-ink">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-muted">Optional</span>}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-clay-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({ className, ref, ...rest }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn("input", className)} {...rest} />;
}

export function TextArea({ className, ref, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} className={cn("input leading-relaxed", className)} {...rest} />;
}

export function Select({ className, ref, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  return <select ref={ref} className={cn("input appearance-auto pr-8", className)} {...rest} />;
}

type Tone = "info" | "success" | "warning" | "danger";
const ALERT_TONES: Record<Tone, { box: string; icon: ReactNode }> = {
  info: { box: "bg-sage-50 border-sage-200 text-sage-900", icon: <Info className="size-5 text-sage-600" aria-hidden /> },
  success: { box: "bg-sage-100 border-sage-300 text-sage-900", icon: <CheckCircle2 className="size-5 text-sage-700" aria-hidden /> },
  warning: { box: "bg-mustard-50 border-mustard-300 text-mustard-800", icon: <AlertTriangle className="size-5 text-mustard-700" aria-hidden /> },
  danger: { box: "bg-clay-50 border-clay-300 text-clay-700", icon: <XCircle className="size-5 text-clay-500" aria-hidden /> },
};

export function Alert({ tone = "info", title, children, action, className }: { tone?: Tone; title?: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-2xl border p-4 text-sm", ALERT_TONES[tone].box, className)}>
      <div className="mt-0.5 shrink-0">{ALERT_TONES[tone].icon}</div>
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", className)}>{children}</span>;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted" role="status">
      <Loader2 className="size-5 animate-spin text-sage-600" aria-hidden />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-4 rounded-full bg-sage-50 p-4 text-sage-600 ring-1 ring-sage-200">{icon}</div>}
      <h2 className="text-xl font-semibold">{title}</h2>
      {children && <div className="mt-2 max-w-md text-sm leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-3xl font-semibold md:text-4xl">{title}</h1>
        {description && <div className="mt-2 text-[0.95rem] leading-relaxed text-ink-soft">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ index, title, description, id }: { index?: string; title: string; description?: ReactNode; id?: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      {index && <span className="font-display text-sm text-mustard-700">{index}</span>}
      <div>
        <h2 id={id} className="text-xl font-semibold md:text-2xl">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
    </div>
  );
}
