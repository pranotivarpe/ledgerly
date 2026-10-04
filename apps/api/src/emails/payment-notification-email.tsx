import { Button, Heading, Text } from '@react-email/components';
import { EmailLayout, styles } from './layout.js';

export function PaymentNotificationEmail({
  clientName,
  invoiceNumber,
  amount,
  invoiceUrl,
}: {
  clientName: string;
  invoiceNumber: string;
  amount: string;
  invoiceUrl: string;
}) {
  return (
    <EmailLayout preview={`${clientName} paid ${amount} for ${invoiceNumber}`}>
      <Heading as="h1" style={styles.heading}>
        You got paid 🎉
      </Heading>
      <Text style={styles.text}>
        <strong>{clientName}</strong> just paid <strong>{amount}</strong> for invoice{' '}
        {invoiceNumber} through the client portal. The invoice has been marked as paid
        automatically.
      </Text>
      <Button href={invoiceUrl} style={styles.button}>
        View invoice
      </Button>
    </EmailLayout>
  );
}
