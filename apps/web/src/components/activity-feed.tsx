import {
  CircleCheck,
  CreditCard,
  FileText,
  FolderKanban,
  Mail,
  Settings,
  UserPlus,
  Users,
  UsersRound,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityItem } from '@/lib/dashboard';
import { formatMoney, timeAgo } from '@/lib/utils';

const titleCase = (v: unknown) =>
  String(v ?? '').charAt(0) +
  String(v ?? '')
    .slice(1)
    .toLowerCase();

function describe(a: ActivityItem, currency: string): { icon: LucideIcon; text: string } {
  const m = (a.metadata ?? {}) as Record<string, string | number | undefined>;
  const who = a.actorName ?? 'Someone';
  switch (a.action) {
    case 'invoice.created':
      return {
        icon: FileText,
        text: m.duplicatedFrom
          ? `${who} duplicated ${m.duplicatedFrom} as ${m.number}`
          : `${who} created invoice ${m.number}`,
      };
    case 'invoice.updated':
      return { icon: FileText, text: `${who} edited invoice ${m.number}` };
    case 'invoice.sent':
      return { icon: Mail, text: `${who} sent ${m.number} to ${m.to}` };
    case 'invoice.reminder_sent':
      return {
        icon: Mail,
        text: m.automatic
          ? `Automatic reminder sent for ${m.number}`
          : `${who} sent a reminder for ${m.number}`,
      };
    case 'client.portal_invited':
      return { icon: Mail, text: `${who} invited ${m.name} to the client portal` };
    case 'invoice.paid':
      return {
        icon: CircleCheck,
        text: `${m.number} was ${m.method === 'STRIPE' ? 'paid online' : 'marked paid'}${typeof m.amountCents === 'number' ? ` · ${formatMoney(m.amountCents, currency)}` : ''}`,
      };
    case 'invoice.voided':
      return { icon: XCircle, text: `${who} voided ${m.number}` };
    case 'invoice.deleted':
      return { icon: XCircle, text: `${who} deleted draft ${m.number}` };
    case 'client.created':
      return { icon: UsersRound, text: `${who} added client ${m.name}` };
    case 'client.updated':
      return { icon: UsersRound, text: `${who} updated client ${m.name}` };
    case 'client.archived':
      return { icon: UsersRound, text: `${who} archived client ${m.name}` };
    case 'client.restored':
      return { icon: UsersRound, text: `${who} restored client ${m.name}` };
    case 'project.created':
      return { icon: FolderKanban, text: `${who} created project ${m.name}` };
    case 'project.updated':
      return { icon: FolderKanban, text: `${who} updated project ${m.name}` };
    case 'member.invited':
      return { icon: UserPlus, text: `${who} invited ${m.email}` };
    case 'member.joined':
      return { icon: Users, text: `${who} joined the team` };
    case 'member.removed':
      return { icon: Users, text: `${who} removed a team member` };
    case 'member.role_changed':
      return { icon: Users, text: `${who} changed a role to ${String(m.to).toLowerCase()}` };
    case 'billing.plan_changed':
      return {
        icon: CreditCard,
        text: `Plan changed from ${titleCase(m.from)} to ${titleCase(m.to)}`,
      };
    case 'billing.plan_change_requested':
      return { icon: CreditCard, text: `${who} switched the plan to ${titleCase(m.to)}` };
    case 'billing.payment_failed':
      return { icon: XCircle, text: 'A subscription payment failed' };
    case 'organization.created':
      return { icon: Settings, text: `${who} created the workspace` };
    case 'organization.updated':
      return { icon: Settings, text: `${who} updated workspace settings` };
    default:
      return { icon: FileText, text: `${who} · ${a.action}` };
  }
}

export function ActivityFeed({ items, currency }: { items: ActivityItem[]; currency: string }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>;
  }
  return (
    <ol className="space-y-4">
      {items.map((a) => {
        const { icon: Icon, text } = describe(a, currency);
        return (
          <li key={a.id} className="flex gap-3">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm leading-snug">{text}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(a.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
