import { Button, Heading, Text } from '@react-email/components';
import { EmailLayout, styles } from './layout.js';

export function BillingFailedEmail({
  organizationName,
  amount,
  billingUrl,
}: {
  organizationName: string;
  amount: string;
  billingUrl: string;
}) {
  return (
    <EmailLayout preview={`Action needed: your Ledgerly payment of ${amount} failed`}>
      <Heading as="h1" style={styles.heading}>
        Your subscription payment failed
      </Heading>
      <Text style={styles.text}>
        We couldn't charge {amount} for {organizationName}'s Ledgerly subscription. Stripe will
        retry automatically over the next few days, but to avoid losing paid features, please update
        your payment method.
      </Text>
      <Button href={billingUrl} style={styles.button}>
        Update payment method
      </Button>
      <Text style={styles.muted}>Your data is safe — nothing is deleted if a payment fails.</Text>
    </EmailLayout>
  );
}
