import { Plus, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ClientFormDialog } from '@/components/client-form-dialog';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { SearchInput } from '@/components/search-input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { cn, formatMoney } from '@/lib/utils';

export function ClientsPage() {
  const org = useCurrentOrg();
  const navigate = useNavigate();
  const canWrite = useCan('clients:write');
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const clients = useClients(org.slug, { q, archived });

  const isEmpty = !q && !archived && clients.data?.length === 0;

  return (
    <>
      <PageHeader
        title="Clients"
        description="The companies and people you bill."
        actions={
          canWrite && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus /> New client
            </Button>
          )
        }
      />

      {isEmpty ? (
        <EmptyState
          icon={UsersRound}
          title="Add your first client"
          description="Clients are who you send invoices to. Add one to start billing."
          action={
            canWrite && (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus /> New client
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
              placeholder="Search clients"
              className="sm:w-72"
            />
            <div className="inline-flex rounded-lg bg-muted p-1 text-sm">
              {[
                { label: 'Active', value: false },
                { label: 'Archived', value: true },
              ].map((tab) => (
                <button
                  key={tab.label}
                  onClick={() => setArchived(tab.value)}
                  className={cn(
                    'rounded-md px-3 py-1 font-medium transition-colors',
                    archived === tab.value
                      ? 'bg-background shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          {clients.isPending ? (
            <div className="flex justify-center py-12">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : clients.data?.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {archived ? 'No archived clients.' : 'No clients match your search.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Projects</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Invoices</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.data?.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/app/${org.slug}/clients/${c.id}`)}
                  >
                    <TableCell>
                      <p className="font-medium">{c.company || c.name}</p>
                      {c.company && <p className="text-xs text-muted-foreground">{c.name}</p>}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {c.email}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {c.projectCount}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {c.invoiceCount}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-medium tabular-nums',
                        c.outstandingCents === 0 && 'text-muted-foreground',
                      )}
                    >
                      {formatMoney(c.outstandingCents, org.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      <ClientFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={(c) => navigate(`/app/${org.slug}/clients/${c.id}`)}
      />
    </>
  );
}
