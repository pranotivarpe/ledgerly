import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-foreground ring-primary/15',
        neutral: 'bg-muted text-muted-foreground ring-border',
        success: 'bg-success/10 text-success ring-success/20',
        warning: 'bg-warning/15 text-[oklch(0.5_0.12_70)] ring-warning/30 dark:text-warning',
        danger: 'bg-destructive/10 text-destructive ring-destructive/20',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
