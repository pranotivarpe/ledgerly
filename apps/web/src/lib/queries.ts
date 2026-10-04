import { useQueryClient } from '@tanstack/react-query';

/** Every org-scoped query key starts with ['org', slug] — invalidate them all after a write. */
export function useInvalidateOrg(slug: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['org', slug] });
}

export function toQueryString(
  params: Record<string, string | number | boolean | undefined | null>,
) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}
