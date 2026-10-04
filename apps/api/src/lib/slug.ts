import { randomBytes } from 'node:crypto';
import { prisma } from './prisma.js';

export function slugify(input: string): string {
  return (
    input
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'workspace'
  );
}

const RESERVED = new Set(['new', 'api', 'app', 'admin', 'settings', 'login', 'signup', 'portal']);

/** Slug from the org name; appends a short random suffix if it's taken or reserved. */
export async function uniqueOrgSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  for (let attempt = 0; attempt < 5; attempt++) {
    const taken =
      RESERVED.has(candidate) ||
      (await prisma.organization.findUnique({ where: { slug: candidate }, select: { id: true } }));
    if (!taken) return candidate;
    candidate = `${base}-${randomBytes(2).toString('hex')}`;
  }
  return `${base}-${randomBytes(4).toString('hex')}`;
}
