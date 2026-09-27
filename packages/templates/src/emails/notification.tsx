import { Button, Heading, Section, Text } from "react-email";
import { Layout, styles } from "./_components/layout";

export interface NotificationProps {
  title: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
}

export const PreviewProps: NotificationProps = {
  title: "Your export is ready",
  body: "The CSV export you asked for has finished.\n\nIt will be available to download for 7 days.",
  ctaText: "Download export",
  ctaUrl: "https://app.example.com/exports/123",
};

export function Notification({ title, body, ctaText, ctaUrl }: NotificationProps) {
  // A blank line starts a new paragraph. A single newline stays a line break.
  const paragraphs = body.split(/\n\s*\n/);
  return (
    <Layout preview={title}>
      <Heading as="h1" style={styles.heading}>
        {title}
      </Heading>
      {paragraphs.map((paragraph, i) => (
        <Text key={i} style={{ ...styles.text, whiteSpace: "pre-line" }}>
          {paragraph}
        </Text>
      ))}
      {ctaUrl ? (
        <Section style={{ margin: "24px 0 0" }}>
          <Button href={ctaUrl} style={styles.button}>
            {ctaText ?? "Open"}
          </Button>
        </Section>
      ) : null}
    </Layout>
  );
}

Notification.PreviewProps = PreviewProps;
export default Notification;
