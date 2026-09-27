import type { ReactNode } from "react";
import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "react-email";

export const colors = {
  background: "#f4f5f7",
  card: "#ffffff",
  border: "#e4e6eb",
  text: "#1f2328",
  muted: "#656d76",
  accent: "#1f2328",
  accentText: "#ffffff",
} as const;

export const fontFamily =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const styles = {
  heading: { fontSize: "22px", lineHeight: "30px", fontWeight: 600, color: colors.text, margin: "0 0 16px" },
  text: { fontSize: "15px", lineHeight: "24px", color: colors.text, margin: "0 0 16px" },
  muted: { fontSize: "13px", lineHeight: "20px", color: colors.muted, margin: "0 0 12px" },
  button: {
    backgroundColor: colors.accent,
    color: colors.accentText,
    borderRadius: "6px",
    fontSize: "15px",
    fontWeight: 600,
    textDecoration: "none",
    padding: "12px 20px",
    display: "inline-block",
  },
} as const;

export interface LayoutProps {
  /** Short text shown by mail clients next to the subject line. */
  preview: string;
  children: ReactNode;
  /** Optional line in the footer, e.g. why the recipient got this email. */
  footer?: string;
}

export function Layout({ preview, children, footer }: LayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: colors.background, fontFamily, margin: 0, padding: "32px 0" }}>
        <Container
          style={{
            backgroundColor: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: "8px",
            maxWidth: "560px",
            padding: "32px",
          }}
        >
          {children}
          {footer ? (
            <Section>
              <Hr style={{ borderColor: colors.border, margin: "24px 0 16px" }} />
              <Text style={{ ...styles.muted, margin: 0 }}>{footer}</Text>
            </Section>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}
