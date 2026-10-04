export type PlanId = 'FREE' | 'PRO' | 'TEAM';

export const PLANS: {
  id: PlanId;
  name: string;
  price: number;
  tagline: string;
  features: string[];
  highlighted?: boolean;
}[] = [
  {
    id: 'FREE',
    name: 'Free',
    price: 0,
    tagline: 'For freelancers getting started',
    features: [
      '1 team seat',
      'Up to 3 clients',
      '5 invoices per month',
      'Client portal',
      'PDF invoices',
    ],
  },
  {
    id: 'PRO',
    name: 'Pro',
    price: 19,
    tagline: 'For growing studios',
    highlighted: true,
    features: [
      '3 team seats',
      'Unlimited clients',
      'Unlimited invoices',
      'Custom branding',
      'Automatic payment reminders',
    ],
  },
  {
    id: 'TEAM',
    name: 'Team',
    price: 49,
    tagline: 'For established agencies',
    features: [
      '10 team seats',
      'Everything in Pro',
      'Role-based permissions',
      'Revenue analytics',
      'Priority support',
    ],
  },
];
