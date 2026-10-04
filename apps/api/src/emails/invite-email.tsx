import { Button, Heading, Link, Text } from '@react-email/components';
import { EmailLayout, styles } from './layout.js';

export type InviteEmailProps = {
  inviterName: string;
  organizationName: string;
  role: string;
  acceptUrl: string;
  expiresInDays: number;
};

export function InviteEmail({
  inviterName,
  organizationName,
  role,
  acceptUrl,
  expiresInDays,
}: InviteEmailProps) {
  return (
    <EmailLayout preview={`${inviterName} invited you to join ${organizationName} on Ledgerly`}>
      <Heading as="h1" style={styles.heading}>
        Join {organizationName} on Ledgerly
      </Heading>
      <Text style={styles.text}>
        <strong>{inviterName}</strong> has invited you to join <strong>{organizationName}</strong>{' '}
        as {role === 'ADMIN' ? 'an Admin' : 'a Member'}. Ledgerly is where the team manages clients,
        projects and invoices.
      </Text>
      <Button href={acceptUrl} style={styles.button}>
        Accept invitation
      </Button>
      <Text style={styles.muted}>
        This invitation expires in {expiresInDays} days. If the button doesn't work, paste this link
        into your browser:
        <br />
        <Link href={acceptUrl} style={{ color: '#4f46e5', wordBreak: 'break-all' }}>
          {acceptUrl}
        </Link>
      </Text>
      <Text style={styles.muted}>
        If you weren't expecting this, you can safely ignore this email.
      </Text>
    </EmailLayout>
  );
}
