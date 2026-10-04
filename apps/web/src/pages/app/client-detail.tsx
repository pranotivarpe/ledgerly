import {
  Archive,
  Check,
  Copy,
  ExternalLink,
  Globe,
  ArchiveRestore,
  ArrowLeft,
  FileText,
  FolderKanban,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ClientFormDialog } from '@/components/client-form-dialog';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ProjectFormDialog } from '@/components/project-form-dialog';
import { InvoiceStatusBadge, ProjectStatusBadge } from '@/components/status-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FullPageSpinner, Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useClient, useDeleteClient, usePortalInvite, useUpdateClient } from '@/lib/clients';
import { useCan, useCurrentOrg } from '@/lib/org-context';
import { toastError } from '@/lib/plan-limit';
import type { ProjectStatus } from '@/lib/projects';
import { formatDate, formatMoney } from '@/lib/utils';

export function ClientDetailPage() {
  const { clientId } = useParams();
  const org = useCurrentOrg();
  const navigate = useNavigate();
  const canWrite = useCan('clients:write');
  const canInvoice = useCan('invoices:write');
  const { data, isPending, isError } = useClient(org.slug, clientId);
  const update = useUpdateClient(org.slug);
  const remove = useDeleteClient(org.slug);
  const [editOpen, setEditOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isPending) return <FullPageSpinner />;
  if (isError || !data) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-xl font-semibold">Client not found</h1>
        <Button variant="link" asChild>
          <Link to={`/app/${org.slug}/clients`}>Back to clients</Link>
        </Button>
      </div>
    );
  }

  const { client, stats } = data;
  const money = (c: number) => formatMoney(c, org.currency);
  const archived = Boolean(client.archivedAt);

  const toggleArchive = () =>
    update.mutate(
      { id: client.id, archived: !archived },
      {
        onSuccess: () => toast.success(archived ? 'Client restored' : 'Client archived'),
        onError: (err) => toastError(err, () => navigate(`/app/${org.slug}/billing`)),
      },
    );

  return (
    <>
      <Link
        to={`/app/${org.slug}/clients`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Clients
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {client.company || client.name}
            </h1>
            {archived && <Badge variant="neutral">Archived</Badge>}
          </div>
          {client.company && <p className="mt-1 text-muted-foreground">{client.name}</p>}
        </div>
        <div className="flex gap-2">
          {canInvoice && !archived && (
            <Button asChild>
              <Link to={`/app/${org.slug}/invoices/new?clientId=${client.id}`}>
                <Plus /> New invoice
              </Link>
            </Button>
          )}
          {canWrite && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Client actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                  <Pencil /> Edit details
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={toggleArchive}>
                  {archived ? <ArchiveRestore /> : <Archive />}{' '}
                  {archived ? 'Restore client' : 'Archive client'}
                </DropdownMenuItem>
                {client.invoices.length === 0 && (
                  <DropdownMenuItem
                    className="text-destructive data-[highlighted]:text-destructive [&_svg]:text-destructive"
                    onSelect={() => setDeleteOpen(true)}
                  >
                    <Trash2 /> Delete client
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Outstanding', value: stats.outstandingCents },
          { label: 'Overdue', value: stats.overdueCents, danger: stats.overdueCents > 0 },
          { label: 'Paid to date', value: stats.paidCents },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p
                className={`mt-1 text-2xl font-semibold tabular-nums ${s.danger ? 'text-destructive' : ''}`}
              >
                {money(s.value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Invoices</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              {client.invoices.length === 0 ? (
                <p className="px-6 pb-4 text-sm text-muted-foreground">
                  No invoices for this client yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead className="hidden sm:table-cell">Issued</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {client.invoices.map((inv) => (
                      <TableRow
                        key={inv.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/app/${org.slug}/invoices/${inv.id}`)}
                      >
                        <TableCell className="font-medium">{inv.number}</TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {formatDate(inv.issueDate)}
                        </TableCell>
                        <TableCell>
                          <InvoiceStatusBadge status={inv.status} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(inv.totalCents, inv.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Projects</CardTitle>
              {canWrite && !archived && (
                <Button variant="outline" size="sm" onClick={() => setProjectOpen(true)}>
                  <Plus /> New project
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {client.projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No projects yet.</p>
              ) : (
                <ul className="divide-y">
                  {client.projects.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <FolderKanban className="size-4 text-muted-foreground" />
                      <span className="flex-1 truncate text-sm font-medium">{p.name}</span>
                      {p.dueDate && (
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          Due {formatDate(p.dueDate)}
                        </span>
                      )}
                      <ProjectStatusBadge status={p.status as ProjectStatus} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="flex items-start gap-3">
                <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <a
                  href={`mailto:${client.email}`}
                  className="break-all text-primary hover:underline"
                >
                  {client.email}
                </a>
              </p>
              {client.phone && (
                <p className="flex items-start gap-3">
                  <Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {client.phone}
                </p>
              )}
              {client.address && (
                <p className="flex items-start gap-3 whitespace-pre-line">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{' '}
                  {client.address}
                </p>
              )}
              {client.notes && (
                <div className="rounded-md bg-muted p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <FileText className="size-3.5" /> Internal notes
                  </p>
                  <p className="whitespace-pre-line">{client.notes}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Client since {formatDate(client.createdAt)}
              </p>
            </CardContent>
          </Card>
          {!archived && (
            <PortalAccessCard clientId={client.id} email={client.email} canInvite={canWrite} />
          )}
        </div>
      </div>

      <ClientFormDialog open={editOpen} onOpenChange={setEditOpen} client={client} />
      <ProjectFormDialog
        open={projectOpen}
        onOpenChange={setProjectOpen}
        defaultClientId={client.id}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${client.company || client.name}?`}
        description="This permanently deletes the client and their projects. This can't be undone."
        confirmLabel="Delete client"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(client.id, {
            onSuccess: () => {
              toast.success('Client deleted');
              navigate(`/app/${org.slug}/clients`, { replace: true });
            },
            onError: (err) => {
              setDeleteOpen(false);
              toast.error(err.message);
            },
          })
        }
      />
    </>
  );
}

function PortalAccessCard({
  clientId,
  email,
  canInvite,
}: {
  clientId: string;
  email: string;
  canInvite: boolean;
}) {
  const org = useCurrentOrg();
  const invite = usePortalInvite(org.slug);
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/portal/${org.slug}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the link instead");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="size-4 text-muted-foreground" /> Client portal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          This client signs in with <span className="font-medium text-foreground">{email}</span> to
          view and pay their invoices online.
        </p>
        <div className="flex items-center gap-1 rounded-md border bg-muted/50 py-1 pr-1 pl-3">
          <span className="flex-1 truncate font-mono text-xs">{url}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={copy}
            aria-label="Copy portal link"
          >
            {copied ? <Check className="text-success" /> : <Copy />}
          </Button>
          <Button variant="ghost" size="icon" className="size-7" asChild>
            <a href={url} target="_blank" rel="noreferrer" aria-label="Open portal">
              <ExternalLink />
            </a>
          </Button>
        </div>
        {canInvite && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={invite.isPending}
            onClick={() =>
              invite.mutate(clientId, {
                onSuccess: () => toast.success(`Sign-in link sent to ${email}`),
                onError: (err) => toast.error(err.message),
              })
            }
          >
            {invite.isPending ? <Spinner /> : <Mail />} Email a sign-in link
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
