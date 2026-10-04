import { Button, Heading, Section, Text } from '@react-email/components';
import { EmailLayout, colors, styles } from './layout.js';

export type PaymentReceiptEmailProps = {
  organizationName: string;
  clientName: string;
  invoiceNumber: string;
  amount: string;
  paidOn: string;
  invoiceUrl: string;
};

export function PaymentReceiptEmail({
  organizationName,
  clientName,
  invoiceNumber,
  amount,
  paidOn,
  invoiceUrl,
}: PaymentReceiptEmailProps) {
  return (
    <EmailLayout preview={`Receipt for ${amount} paid to ${organizationName}`}>
      <Heading as="h1" style={styles.heading}>
        Payment received — thank you!
      </Heading>
      <Text style={styles.text}>Hi {clientName},</Text>
      <Text style={styles.text}>
        We've received your payment for invoice {invoiceNumber} from {organizationName}. Keep this
        email for your records.
      </Text>
      <Section
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: 10,
          padding: '16px 20px',
          margin: '8px 0 16px',
        }}
      >
        <Text style={{ ...styles.muted, margin: 0 }}>Amount paid</Text>
        <Text style={{ fontSize: 26, fontWeight: 700, color: colors.text, margin: '2px 0 8px' }}>
          {amount}
        </Text>
        <Text style={{ ...styles.muted, margin: 0 }}>
          Invoice {invoiceNumber} · paid {paidOn}
        </Text>
      </Section>
      <Button href={invoiceUrl} style={styles.button}>
        View invoice
      </Button>
    </EmailLayout>
  );
}
