import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api';

/**
 * Maps an API error onto a react-hook-form: server-side field validation errors land on their
 * fields, anything else becomes a form-level `root` error. Returns the message for toasts.
 */
export function applyServerErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
) {
  if (err instanceof ApiError) {
    const fieldErrors = err.details?.fieldErrors ?? {};
    for (const [field, messages] of Object.entries(fieldErrors)) {
      if (messages?.[0]) setError(field as Path<T>, { message: messages[0] });
    }
    setError('root', { message: err.message });
    return err.message;
  }
  const message = 'Something went wrong. Please try again.';
  setError('root', { message });
  return message;
}
