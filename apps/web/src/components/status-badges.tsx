import { Badge } from '@/components/ui/badge';
import { INVOICE_STATUS, type InvoiceStatus } from '@/lib/invoices';
import { PROJECT_STATUS, type ProjectStatus } from '@/lib/projects';
import { cn } from '@/lib/utils';

export function InvoiceStatusBadge({
  status,
  className,
}: {
  status: InvoiceStatus;
  className?: string;
}) {
  const { label, variant } = INVOICE_STATUS[status];
  return (
    <Badge variant={variant} className={cn(status === 'VOID' && 'line-through', className)}>
      {label}
    </Badge>
  );
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { label, variant } = PROJECT_STATUS[status];
  return <Badge variant={variant}>{label}</Badge>;
}
