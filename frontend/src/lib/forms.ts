import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "../api/client";

/** Copies backend field validation messages onto the matching form inputs. */
export function applyFieldErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fields: string[]): boolean {
  if (!(error instanceof ApiError) || error.fieldErrors.length === 0) return false;
  let applied = false;
  for (const fe of error.fieldErrors) {
    if (fields.includes(fe.field)) {
      setError(fe.field as Path<T>, { message: fe.message });
      applied = true;
    }
  }
  return applied;
}
