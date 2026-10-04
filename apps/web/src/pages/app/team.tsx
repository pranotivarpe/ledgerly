import { zodResolver } from '@hookform/resolvers/zod';
import {
  Mail,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
  Trash2,
  UserMinus,
  UserPlus,
  LogOut,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormError, FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { ApiError } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { applyServerErrors } from '@/lib/forms';
import { useCan, useCurrentOrg } from '@/lib/org-context';
import {
  assignableRoles,
  canManageMember,
  ROLE_INFO,
  useInvitations,
  useInvite,
  useMembers,
  useRemoveMember,
  useResendInvite,
  useRevokeInvite,
  useUpdateMemberRole,
  type Member,
  type PendingInvitation,
} from '@/lib/team';
import type { Role } from '@/lib/types';
import { cn, formatDate, formatRelative, initials } from '@/lib/utils';

export function TeamPage() {
  const org = useCurrentOrg();
  const canInvite = useCan('members:invite');
  const members = useMembers(org.slug);
  const invitations = useInvitations(org.slug, canInvite);
  const [inviteOpen, setInviteOpen] = useState(false);

  const seats = members.data?.seats;
  const seatsFull = seats ? seats.used >= seats.limit : false;

  return (
    <>
      <PageHeader
        title="Team"
        description="Invite teammates and control what they can do."
        actions={
          canInvite && (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus /> Invite member
            </Button>
          )
        }
      />

      {seats && <SeatUsage used={seats.used} limit={seats.limit} />}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>People with access to {org.name}.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {members.isPending ? (
            <div className="flex justify-center py-10">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : (
            <ul className="divide-y">
              {members.data?.members.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  isLastOwner={
                    m.role === 'OWNER' &&
                    members.data.members.filter((x) => x.role === 'OWNER').length === 1
                  }
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canInvite && (invitations.data?.length ?? 0) > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
            <CardDescription>Invitations that haven't been accepted yet.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <ul className="divide-y">
              {invitations.data?.map((inv) => (
                <InvitationRow key={inv.id} invitation={inv} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} seatsFull={seatsFull} />
    </>
  );
}

function SeatUsage({ used, limit }: { used: number; limit: number }) {
  const org = useCurrentOrg();
  const canManageBilling = useCan('billing:manage');
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const full = used >= limit;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex-1">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm font-medium">
              {used} of {limit} seat{limit === 1 ? '' : 's'} used
            </p>
            <p className="text-xs text-muted-foreground">Includes pending invitations</p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                full ? 'bg-warning' : 'bg-primary',
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        {full && canManageBilling && (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/app/${org.slug}/billing`}>
              <Sparkles /> Upgrade for more seats
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
      {initials(name)}
    </span>
  );
}

function MemberRow({ member, isLastOwner }: { member: Member; isLastOwner: boolean }) {
  const org = useCurrentOrg();
  const { data: me } = useMe();
  const navigate = useNavigate();
  const canUpdate = useCan('members:update');
  const canRemove = useCan('members:remove');
  const updateRole = useUpdateMemberRole(org.slug);
  const remove = useRemoveMember(org.slug);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isSelf = member.user.id === me?.user.id;
  const manageable = canManageMember(org.role, member.role);
  // The API also enforces this; hiding the controls avoids a guaranteed error.
  const roleEditable = canUpdate && manageable && !isLastOwner;
  const removable = !isLastOwner && (isSelf || (canRemove && manageable));

  const changeRole = (role: Role) =>
    updateRole.mutate(
      { id: member.id, role },
      {
        onSuccess: () =>
          toast.success(`${member.user.name} is now ${ROLE_INFO[role].label.toLowerCase()}`),
        onError: (err) => toast.error(err.message),
      },
    );

  const confirmRemove = () =>
    remove.mutate(member.id, {
      onSuccess: () => {
        setConfirmOpen(false);
        if (isSelf) {
          toast.success(`You left ${org.name}`);
          navigate('/app', { replace: true });
        } else {
          toast.success(`${member.user.name} was removed`);
        }
      },
      onError: (err) => {
        setConfirmOpen(false);
        toast.error(err.message);
      },
    });

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-3">
      <Avatar name={member.user.name} />
      <div className="min-w-40 flex-1">
        <p className="truncate text-sm font-medium">
          {member.user.name}{' '}
          {isSelf && <span className="font-normal text-muted-foreground">(you)</span>}
        </p>
        <p className="truncate text-sm text-muted-foreground">{member.user.email}</p>
      </div>
      <p className="hidden text-sm text-muted-foreground md:block">
        Joined {formatDate(member.joinedAt)}
      </p>
      <div className="sm:w-32">
        {roleEditable ? (
          <Select
            aria-label={`Role for ${member.user.name}`}
            value={member.role}
            disabled={updateRole.isPending}
            onChange={(e) => changeRole(e.target.value as Role)}
            className="h-8"
          >
            {assignableRoles(org.role).map((r) => (
              <option key={r} value={r}>
                {ROLE_INFO[r].label}
              </option>
            ))}
          </Select>
        ) : (
          <Badge variant={member.role === 'OWNER' ? 'default' : 'neutral'}>
            {ROLE_INFO[member.role].label}
          </Badge>
        )}
      </div>
      <div className={cn('w-9', !removable && 'hidden sm:block')}>
        {removable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Actions for ${member.user.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive data-[highlighted]:text-destructive [&_svg]:text-destructive"
                onSelect={() => setConfirmOpen(true)}
              >
                {isSelf ? <LogOut /> : <UserMinus />}
                {isSelf ? 'Leave organization' : 'Remove from team'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={isSelf ? `Leave ${org.name}?` : `Remove ${member.user.name}?`}
        description={
          isSelf
            ? "You'll lose access to this organization until someone invites you again."
            : `They'll immediately lose access to ${org.name}. You can invite them again later.`
        }
        confirmLabel={isSelf ? 'Leave' : 'Remove'}
        destructive
        pending={remove.isPending}
        onConfirm={confirmRemove}
      />
    </li>
  );
}

function InvitationRow({ invitation }: { invitation: PendingInvitation }) {
  const org = useCurrentOrg();
  const resend = useResendInvite(org.slug);
  const revoke = useRevokeInvite(org.slug);

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground">
        <Mail className="size-4" />
      </span>
      <div className="min-w-40 flex-1">
        <p className="truncate text-sm font-medium">{invitation.email}</p>
        <p className="truncate text-sm text-muted-foreground">
          Invited by {invitation.invitedBy} ·{' '}
          {invitation.expired ? 'expired' : `expires ${formatRelative(invitation.expiresAt)}`}
        </p>
      </div>
      {invitation.expired ? (
        <Badge variant="warning">Expired</Badge>
      ) : (
        <Badge variant="neutral">{ROLE_INFO[invitation.role].label}</Badge>
      )}
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={resend.isPending}
          onClick={() =>
            resend.mutate(invitation.id, {
              onSuccess: () => toast.success(`Invitation re-sent to ${invitation.email}`),
              onError: (err) => toast.error(err.message),
            })
          }
        >
          <RefreshCw /> Resend
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={revoke.isPending}
          onClick={() =>
            revoke.mutate(invitation.id, {
              onSuccess: () => toast.success('Invitation revoked'),
              onError: (err) => toast.error(err.message),
            })
          }
        >
          <Trash2 /> Revoke
        </Button>
      </div>
    </li>
  );
}

const inviteSchema = z.object({
  email: z.email('Enter a valid email'),
  role: z.enum(['ADMIN', 'MEMBER']),
});
type InviteValues = z.infer<typeof inviteSchema>;

function InviteDialog({
  open,
  onOpenChange,
  seatsFull,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seatsFull: boolean;
}) {
  const org = useCurrentOrg();
  const canManageBilling = useCan('billing:manage');
  const invite = useInvite(org.slug);
  const [planLimitHit, setPlanLimitHit] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    watch,
    formState: { errors },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'MEMBER' },
  });

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      reset();
      setPlanLimitHit(false);
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      const res = await invite.mutateAsync(values);
      if (res.emailSent) toast.success(`Invitation sent to ${values.email}`);
      else toast.warning("Invitation created, but the email couldn't be sent. Try resending it.");
      close(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PLAN_LIMIT') setPlanLimitHit(true);
      applyServerErrors(err, setError);
    }
  });

  const showUpgrade = seatsFull || planLimitHit;
  const role = watch('role');

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>
            They'll get an email with a link to join {org.name}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {showUpgrade ? (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
              <p className="font-medium">You've used all your seats</p>
              <p className="mt-1 text-muted-foreground">
                {errors.root?.message ?? 'Upgrade your plan to invite more teammates.'}
              </p>
              {canManageBilling && (
                <Button size="sm" className="mt-3" asChild>
                  <Link to={`/app/${org.slug}/billing`} onClick={() => close(false)}>
                    <Sparkles /> View plans
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <FormError message={errors.root?.message} />
          )}
          <FormField id="invite-email" label="Email address" error={errors.email?.message}>
            <Input
              id="invite-email"
              type="email"
              placeholder="teammate@agency.com"
              autoFocus
              aria-invalid={!!errors.email}
              {...register('email')}
            />
          </FormField>
          <FormField id="invite-role" label="Role" hint={ROLE_INFO[role].description}>
            <Select id="invite-role" {...register('role')}>
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </Select>
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={invite.isPending || seatsFull}>
              {invite.isPending && <Spinner />} Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
