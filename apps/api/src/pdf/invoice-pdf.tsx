import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { formatMoney } from '../lib/money.js';

export type InvoicePdfData = {
  number: string;
  status: string;
  currency: string;
  issueDate: Date;
  dueDate: Date;
  paidAt: Date | null;
  notes: string | null;
  taxRateBps: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  items: { description: string; quantity: number; unitPriceCents: number; amountCents: number }[];
  organization: { name: string; address: string | null; brandColor: string };
  client: { name: string; company: string | null; email: string; address: string | null };
  project: { name: string } | null;
};

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);

const fmtQty = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(2));

const ink = '#1f2333';
const muted = '#6b7085';
const line = '#e6e8ef';

const s = StyleSheet.create({
  page: { padding: 48, fontFamily: 'Helvetica', fontSize: 10, color: ink, lineHeight: 1.4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brand: { flexDirection: 'row', alignItems: 'center' },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 6,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 14 },
  orgName: { fontFamily: 'Helvetica-Bold', fontSize: 14 },
  titleBlock: { alignItems: 'flex-end' },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 22, letterSpacing: 1, lineHeight: 1 },
  number: { color: muted, marginTop: 6 },
  parties: { flexDirection: 'row', marginTop: 36, gap: 24 },
  party: { flex: 1 },
  label: {
    fontSize: 8,
    color: muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  strong: { fontFamily: 'Helvetica-Bold' },
  meta: {
    flexDirection: 'row',
    marginTop: 24,
    borderTop: `1 solid ${line}`,
    borderBottom: `1 solid ${line}`,
    paddingVertical: 10,
  },
  metaCell: { flex: 1 },
  table: { marginTop: 24 },
  row: { flexDirection: 'row', paddingVertical: 8, borderBottom: `1 solid ${line}` },
  headRow: { flexDirection: 'row', paddingBottom: 6, borderBottom: `1.5 solid ${ink}` },
  th: { fontSize: 8, color: muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  cDesc: { flex: 1, paddingRight: 12 },
  cQty: { width: 50, textAlign: 'right' },
  cPrice: { width: 80, textAlign: 'right' },
  cAmt: { width: 90, textAlign: 'right' },
  totals: { marginTop: 16, marginLeft: 'auto', width: 220 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 8,
    borderTop: `1.5 solid ${ink}`,
  },
  grandText: { fontFamily: 'Helvetica-Bold', fontSize: 13 },
  notes: { marginTop: 32, padding: 12, backgroundColor: '#f6f7fb', borderRadius: 6 },
  paid: {
    position: 'absolute',
    top: 120,
    right: 48,
    borderWidth: 2,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    transform: 'rotate(-8deg)',
  },
  paidText: { fontFamily: 'Helvetica-Bold', fontSize: 16, letterSpacing: 2 },
  footer: {
    position: 'absolute',
    bottom: 32,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    color: muted,
    fontSize: 8,
  },
});

export function InvoicePdf({ data }: { data: InvoicePdfData }) {
  const money = (c: number) => formatMoney(c, data.currency);
  const brand = data.organization.brandColor;
  const isPaid = data.status === 'PAID';

  return (
    <Document title={`Invoice ${data.number}`} author={data.organization.name} creator="Ledgerly">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.brand}>
            <View style={[s.mark, { backgroundColor: brand }]}>
              <Text style={s.markText}>{data.organization.name.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={s.orgName}>{data.organization.name}</Text>
          </View>
          <View style={s.titleBlock}>
            <Text style={[s.title, { color: brand }]}>INVOICE</Text>
            <Text style={s.number}>{data.number}</Text>
          </View>
        </View>

        {isPaid && (
          <View style={[s.paid, { borderColor: '#16a34a' }]}>
            <Text style={[s.paidText, { color: '#16a34a' }]}>PAID</Text>
          </View>
        )}

        <View style={s.parties}>
          <View style={s.party}>
            <Text style={s.label}>From</Text>
            <Text style={s.strong}>{data.organization.name}</Text>
            {data.organization.address && (
              <Text style={{ color: muted }}>{data.organization.address}</Text>
            )}
          </View>
          <View style={s.party}>
            <Text style={s.label}>Bill to</Text>
            <Text style={s.strong}>{data.client.company || data.client.name}</Text>
            {data.client.company && <Text>{data.client.name}</Text>}
            <Text style={{ color: muted }}>{data.client.email}</Text>
            {data.client.address && <Text style={{ color: muted }}>{data.client.address}</Text>}
          </View>
        </View>

        <View style={s.meta}>
          <View style={s.metaCell}>
            <Text style={s.label}>Issue date</Text>
            <Text>{fmtDate(data.issueDate)}</Text>
          </View>
          <View style={s.metaCell}>
            <Text style={s.label}>{isPaid ? 'Paid on' : 'Due date'}</Text>
            <Text>{fmtDate(isPaid && data.paidAt ? data.paidAt : data.dueDate)}</Text>
          </View>
          {data.project && (
            <View style={s.metaCell}>
              <Text style={s.label}>Project</Text>
              <Text>{data.project.name}</Text>
            </View>
          )}
          <View style={s.metaCell}>
            <Text style={s.label}>Amount {isPaid ? 'paid' : 'due'}</Text>
            <Text style={s.strong}>{money(data.totalCents)}</Text>
          </View>
        </View>

        <View style={s.table}>
          <View style={s.headRow}>
            <Text style={[s.th, s.cDesc]}>Description</Text>
            <Text style={[s.th, s.cQty]}>Qty</Text>
            <Text style={[s.th, s.cPrice]}>Unit price</Text>
            <Text style={[s.th, s.cAmt]}>Amount</Text>
          </View>
          {data.items.map((item, i) => (
            <View key={i} style={s.row} wrap={false}>
              <Text style={s.cDesc}>{item.description}</Text>
              <Text style={s.cQty}>{fmtQty(item.quantity)}</Text>
              <Text style={s.cPrice}>{money(item.unitPriceCents)}</Text>
              <Text style={s.cAmt}>{money(item.amountCents)}</Text>
            </View>
          ))}
        </View>

        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text style={{ color: muted }}>Subtotal</Text>
            <Text>{money(data.subtotalCents)}</Text>
          </View>
          {data.taxRateBps > 0 && (
            <View style={s.totalRow}>
              <Text style={{ color: muted }}>
                Tax ({(data.taxRateBps / 100).toFixed(2).replace(/\.00$/, '')}%)
              </Text>
              <Text>{money(data.taxCents)}</Text>
            </View>
          )}
          <View style={s.grandTotal}>
            <Text style={s.grandText}>Total</Text>
            <Text style={s.grandText}>{money(data.totalCents)}</Text>
          </View>
        </View>

        {data.notes && (
          <View style={s.notes} wrap={false}>
            <Text style={s.label}>Notes</Text>
            <Text>{data.notes}</Text>
          </View>
        )}

        <View style={s.footer} fixed>
          <Text>
            {data.organization.name} · {data.number}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoicePdf data={data} />);
}
