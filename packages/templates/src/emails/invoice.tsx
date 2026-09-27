import { Button, Column, Heading, Hr, Row, Section, Text } from "react-email";
import { colors, Layout, styles } from "./_components/layout";

export interface InvoiceItem {
  description: string;
  amount: string;
}

export interface InvoiceProps {
  invoiceNumber: string;
  amount: string;
  dueDate: string;
  items: InvoiceItem[];
  payUrl?: string;
}

export const PreviewProps: InvoiceProps = {
  invoiceNumber: "INV-2026-0042",
  amount: "$129.00",
  dueDate: "2026-10-15",
  items: [
    { description: "Pro plan (October 2026)", amount: "$99.00" },
    { description: "Extra seats x3", amount: "$30.00" },
  ],
  payUrl: "https://app.example.com/billing/invoices/INV-2026-0042",
};

const cell = { fontSize: "14px", lineHeight: "22px", color: colors.text, margin: 0 };

export function Invoice({ invoiceNumber, amount, dueDate, items, payUrl }: InvoiceProps) {
  return (
    <Layout
      preview={`Invoice ${invoiceNumber} for ${amount}, due ${dueDate}`}
      footer="Questions about this invoice? Reply to this email."
    >
      <Heading as="h1" style={styles.heading}>
        Invoice {invoiceNumber}
      </Heading>
      <Section style={{ margin: "0 0 24px" }}>
        <Row>
          <Column>
            <Text style={styles.muted}>Amount due</Text>
            <Text style={{ ...styles.text, fontSize: "20px", fontWeight: 600, margin: 0 }}>{amount}</Text>
          </Column>
          <Column align="right">
            <Text style={styles.muted}>Due date</Text>
            <Text style={{ ...styles.text, margin: 0 }}>{dueDate}</Text>
          </Column>
        </Row>
      </Section>
      <Hr style={{ borderColor: colors.border, margin: "0 0 8px" }} />
      {items.map((item, i) => (
        <Row key={i} style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Column style={{ padding: "8px 0" }}>
            <Text style={cell}>{item.description}</Text>
          </Column>
          <Column align="right" style={{ padding: "8px 0", width: "120px" }}>
            <Text style={cell}>{item.amount}</Text>
          </Column>
        </Row>
      ))}
      <Row>
        <Column style={{ padding: "12px 0" }}>
          <Text style={{ ...cell, fontWeight: 600 }}>Total</Text>
        </Column>
        <Column align="right" style={{ padding: "12px 0", width: "120px" }}>
          <Text style={{ ...cell, fontWeight: 600 }}>{amount}</Text>
        </Column>
      </Row>
      {payUrl ? (
        <Section style={{ margin: "24px 0 0" }}>
          <Button href={payUrl} style={styles.button}>
            Pay invoice
          </Button>
        </Section>
      ) : null}
    </Layout>
  );
}

Invoice.PreviewProps = PreviewProps;
export default Invoice;
