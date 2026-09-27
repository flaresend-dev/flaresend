import { Button, Heading, Section, Text } from "react-email";
import { Layout, styles } from "./_components/layout";

export interface MagicLinkProps {
  loginUrl: string;
  expiresInMinutes: number;
}

export const PreviewProps: MagicLinkProps = {
  loginUrl: "https://app.example.com/auth/magic?token=abc123",
  expiresInMinutes: 15,
};

export function MagicLink({ loginUrl, expiresInMinutes }: MagicLinkProps) {
  return (
    <Layout
      preview="Your sign-in link"
      footer="If you did not try to sign in, you can ignore this email. Nobody can sign in without this link."
    >
      <Heading as="h1" style={styles.heading}>
        Sign in
      </Heading>
      <Text style={styles.text}>
        Use the button below to sign in. The link works once and expires in {expiresInMinutes} minutes.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href={loginUrl} style={styles.button}>
          Sign in
        </Button>
      </Section>
      <Text style={styles.muted}>If the button does not work, copy this link into your browser: {loginUrl}</Text>
    </Layout>
  );
}

MagicLink.PreviewProps = PreviewProps;
export default MagicLink;
