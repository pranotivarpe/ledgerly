import { Button, Heading, Section, Text } from '@react-email/components';
import { EmailLayout, colors, styles } from './layout.js';

export type InvoiceEmailProps = {
  organizationName: string;
  clientName: string;
  invoiceNumber: string;
  amount: string;
  dueDate: string;
  reminder?: boolean;
  /** Magic link that signs the client into the portal on this invoice. */
  payUrl?: string;
};

export function InvoiceEmail({
  organizationName,
  clientName,
  invoiceNumber,
  amount,
  dueDate,
  reminder,
  payUrl,
}: InvoiceEmailProps) {
  return (
    <EmailLayout
      preview={`${reminder ? 'Reminder: ' : ''}Invoice ${invoiceNumber} from ${organizationName} — ${amount} due ${dueDate}`}
    >
      <Heading as="h1" style={styles.heading}>
        {reminder ? `Reminder: invoice ${invoiceNumber}` : `Invoice ${invoiceNumber}`}
      </Heading>
      <Text style={styles.text}>Hi {clientName},</Text>
      <Text style={styles.text}>
        {reminder
          ? `This is a friendly reminder that invoice ${invoiceNumber} from ${organizationName} is still outstanding.`
          : `${organizationName} has sent you a new invoice. The PDF is attached to this email.`}
      </Text>
      <Section
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: 10,
          padding: '16px 20px',
          margin: '8px 0 16px',
        }}
      >
        <Text style={{ ...styles.muted, margin: 0 }}>Amount due</Text>
        <Text style={{ fontSize: 26, fontWeight: 700, color: colors.text, margin: '2px 0 8px' }}>
          {amount}
        </Text>
        <Text style={{ ...styles.muted, margin: 0 }}>Due {dueDate}</Text>
      </Section>
      {payUrl && (
        <Button href={payUrl} style={styles.button}>
          View &amp; pay invoice
        </Button>
      )}
      <Text style={styles.muted}>Questions about this invoice? Just reply to this email.</Text>
    </EmailLayout>
  );
}
