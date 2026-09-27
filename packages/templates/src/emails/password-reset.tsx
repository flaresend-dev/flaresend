import { Button, Heading, Section, Text } from "react-email";
import { Layout, styles } from "./_components/layout";

export interface PasswordResetProps {
  name?: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export const PreviewProps: PasswordResetProps = {
  name: "Ada",
  resetUrl: "https://app.example.com/reset?token=abc123",
  expiresInMinutes: 30,
};

export function PasswordReset({ name, resetUrl, expiresInMinutes }: PasswordResetProps) {
  return (
    <Layout
      preview="Reset your password"
      footer="If you did not ask to reset your password, you can ignore this email. Your password will not change."
    >
      <Heading as="h1" style={styles.heading}>
        Reset your password
      </Heading>
      <Text style={styles.text}>{name ? `Hi ${name},` : "Hi,"}</Text>
      <Text style={styles.text}>
        We got a request to reset the password for your account. Use the button below to choose a new one.
        The link expires in {expiresInMinutes} minutes.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href={resetUrl} style={styles.button}>
          Reset password
        </Button>
      </Section>
      <Text style={styles.muted}>If the button does not work, copy this link into your browser: {resetUrl}</Text>
    </Layout>
  );
}

PasswordReset.PreviewProps = PreviewProps;
export default PasswordReset;
