import { Button, Heading, Link, Text } from '@react-email/components';
import { EmailLayout, styles } from './layout.js';

export type PortalLinkEmailProps = {
  organizationName: string;
  contactName: string;
  url: string;
  expiresIn: string;
  /** Shown when the link was sent by the agency rather than requested by the client. */
  invitedBy?: string;
};

export function PortalLinkEmail({
  organizationName,
  contactName,
  url,
  expiresIn,
  invitedBy,
}: PortalLinkEmailProps) {
  return (
    <EmailLayout preview={`Your sign-in link for ${organizationName}'s client portal`}>
      <Heading as="h1" style={styles.heading}>
        {invitedBy
          ? `${organizationName} invited you to their client portal`
          : `Sign in to ${organizationName}`}
      </Heading>
      <Text style={styles.text}>Hi {contactName},</Text>
      <Text style={styles.text}>
        {invitedBy
          ? `${invitedBy} has given you access to ${organizationName}'s client portal, where you can view and pay your invoices online.`
          : `Use the button below to sign in to ${organizationName}'s client portal. No password needed.`}
      </Text>
      <Button href={url} style={styles.button}>
        Open client portal
      </Button>
      <Text style={styles.muted}>
        This link expires in {expiresIn} and can be used once. If the button doesn't work, paste
        this link into your browser:
        <br />
        <Link href={url} style={{ color: '#4f46e5', wordBreak: 'break-all' }}>
          {url}
        </Link>
      </Text>
      <Text style={styles.muted}>
        If you didn't request this, you can safely ignore this email.
      </Text>
    </EmailLayout>
  );
}
