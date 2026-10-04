import { FolderKanban, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { ProjectFormDialog } from '@/components/project-form-dialog';
import { SearchInput } from '@/components/search-input';
import { ProjectStatusBadge } from '@/components/status-badges';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useClients } from '@/lib/clients';
import { useCan, useCurrentOrg } from '@/lib/org-context';
import {
  useDeleteProject,
  useProjects,
  type ProjectListItem,
  type ProjectStatus,
} from '@/lib/projects';
import { cn, formatDate, formatMoney } from '@/lib/utils';

const TABS: { label: string; value?: ProjectStatus }[] = [
  { label: 'All' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'On hold', value: 'ON_HOLD' },
  { label: 'Completed', value: 'COMPLETED' },
];

export function ProjectsPage() {
  const org = useCurrentOrg();
  const canWrite = useCan('projects:write');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ProjectStatus | undefined>();
  const [editing, setEditing] = useState<ProjectListItem | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<ProjectListItem | undefined>();
  const projects = useProjects(org.slug, { q: q || undefined, status });
  const clients = useClients(org.slug);
  const remove = useDeleteProject(org.slug);

  const openNew = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };
  const hasClients = (clients.data?.length ?? 0) > 0;
  const isEmpty = !q && !status && projects.data?.length === 0;

  return (
    <>
      <PageHeader
        title="Projects"
        description="Track the work you're delivering and what's been billed."
        actions={
          canWrite &&
          hasClients && (
            <Button onClick={openNew}>
              <Plus /> New project
            </Button>
          )
        }
      />

      {isEmpty ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description={
            hasClients
              ? 'Create a project to group invoices and track billing against a budget.'
              : 'Add a client first — every project belongs to a client.'
          }
          action={
            canWrite &&
            hasClients && (
              <Button onClick={openNew}>
                <Plus /> New project
              </Button>
            )
          }
        />
      ) : (
        <Card>
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Search projects"
              className="sm:w-72"
            />
            <div className="inline-flex overflow-x-auto rounded-lg bg-muted p-1 text-sm">
              {TABS.map((tab) => (
                <button
                  key={tab.label}
                  onClick={() => setStatus(tab.value)}
                  className={cn(
                    'rounded-md px-3 py-1 font-medium whitespace-nowrap transition-colors',
                    status === tab.value
                      ? 'bg-background shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          {projects.isPending ? (
            <div className="flex justify-center py-12">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : projects.data?.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No projects match.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Billed / budget</TableHead>
                  <TableHead className="hidden sm:table-cell">Due</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.data?.map((p) => {
                  const pct = p.budgetCents
                    ? Math.min(100, Math.round((p.billedCents / p.budgetCents) * 100))
                    : null;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.client.company || p.client.name}
                        </p>
                      </TableCell>
                      <TableCell>
                        <ProjectStatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="text-sm tabular-nums">
                          {formatMoney(p.billedCents, org.currency)}
                          {p.budgetCents != null && (
                            <span className="text-muted-foreground">
                              {' '}
                              / {formatMoney(p.budgetCents, org.currency)}
                            </span>
                          )}
                        </p>
                        {pct !== null && (
                          <div className="mt-1.5 h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                pct >= 100 ? 'bg-warning' : 'bg-primary',
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {p.dueDate ? formatDate(p.dueDate) : '—'}
                      </TableCell>
                      <TableCell>
                        {canWrite && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Actions for ${p.name}`}
                              >
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onSelect={() => {
                                  setEditing(p);
                                  setDialogOpen(true);
                                }}
                              >
                                <Pencil /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive data-[highlighted]:text-destructive [&_svg]:text-destructive"
                                onSelect={() => setDeleting(p)}
                              >
                                <Trash2 /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      <ProjectFormDialog open={dialogOpen} onOpenChange={setDialogOpen} project={editing} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(undefined)}
        title={`Delete ${deleting?.name}?`}
        description="Invoices for this project are kept; they just won't be linked to it anymore."
        confirmLabel="Delete project"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Project deleted');
              setDeleting(undefined);
            },
            onError: (err) => toast.error(err.message),
          })
        }
      />
    </>
  );
}
