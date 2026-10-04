import { Button, Heading, Text } from '@react-email/components';
import { EmailLayout, styles } from './layout.js';

export function WelcomeEmail({
  name,
  organizationName,
  appUrl,
}: {
  name: string;
  organizationName: string;
  appUrl: string;
}) {
  return (
    <EmailLayout preview={`Welcome to Ledgerly — ${organizationName} is ready`}>
      <Heading as="h1" style={styles.heading}>
        Welcome to Ledgerly, {name.split(' ')[0]}!
      </Heading>
      <Text style={styles.text}>
        Your workspace for <strong>{organizationName}</strong> is ready. Here's how to get your
        first payment in:
      </Text>
      <Text style={styles.text}>
        1. Add a client
        <br />
        2. Create an invoice and send it — your client gets a PDF and a pay link
        <br />
        3. Get paid online and watch it land on your dashboard
      </Text>
      <Button href={appUrl} style={styles.button}>
        Open your workspace
      </Button>
      <Text style={styles.muted}>Questions? Just reply to this email.</Text>
    </EmailLayout>
  );
}
