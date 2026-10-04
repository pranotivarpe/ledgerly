import { toast } from 'sonner';
import { ApiError } from './api';

/**
 * Shows a toast for an API error. Plan-limit errors (402) get an "Upgrade" action that opens
 * the billing page. Returns true when the error was a plan limit.
 */
export function toastError(err: unknown, navigateToBilling?: () => void) {
  if (err instanceof ApiError && err.code === 'PLAN_LIMIT') {
    toast.warning('Plan limit reached', {
      description: err.message,
      action: navigateToBilling ? { label: 'Upgrade', onClick: navigateToBilling } : undefined,
      duration: 8000,
    });
    return true;
  }
  toast.error(err instanceof Error ? err.message : 'Something went wrong');
  return false;
}
