import { Body, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';

export const colors = {
  primary: '#4f46e5',
  text: '#1f2333',
  muted: '#6b7085',
  border: '#e6e8ef',
  background: '#f6f7fb',
};

export function EmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: colors.background,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          margin: 0,
          padding: '32px 0',
        }}
      >
        <Container style={{ maxWidth: 520, margin: '0 auto', padding: '0 16px' }}>
          <Text style={{ fontSize: 18, fontWeight: 700, color: colors.text, margin: '0 0 20px' }}>
            <span
              style={{
                display: 'inline-block',
                width: 22,
                height: 22,
                borderRadius: 6,
                backgroundColor: colors.primary,
                verticalAlign: 'middle',
                marginRight: 8,
              }}
            />
            Ledgerly
          </Text>
          <Section
            style={{
              backgroundColor: '#ffffff',
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              padding: '32px 28px',
            }}
          >
            {children}
          </Section>
          <Hr style={{ borderColor: 'transparent', margin: '16px 0 0' }} />
          <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', margin: 0 }}>
            Ledgerly · Client portal & invoicing for agencies
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const styles = {
  heading: { fontSize: 20, fontWeight: 600, color: colors.text, margin: '0 0 12px' },
  text: { fontSize: 15, lineHeight: '24px', color: colors.text, margin: '0 0 16px' },
  muted: { fontSize: 13, lineHeight: '20px', color: colors.muted, margin: '16px 0 0' },
  button: {
    backgroundColor: colors.primary,
    color: '#ffffff',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    padding: '12px 20px',
    textDecoration: 'none',
    display: 'inline-block',
  },
} as const;
