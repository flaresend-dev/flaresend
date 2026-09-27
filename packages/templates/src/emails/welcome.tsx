import { Button, Heading, Section, Text } from "react-email";
import { Layout, styles } from "./_components/layout";

export interface WelcomeProps {
  name: string;
  appName: string;
  loginUrl: string;
}

export const PreviewProps: WelcomeProps = {
  name: "Ada",
  appName: "Acme",
  loginUrl: "https://app.example.com/login",
};

export function Welcome({ name, appName, loginUrl }: WelcomeProps) {
  return (
    <Layout
      preview={`Welcome to ${appName}`}
      footer={`You are receiving this email because an account was created for you on ${appName}.`}
    >
      <Heading as="h1" style={styles.heading}>
        Welcome to {appName}
      </Heading>
      <Text style={styles.text}>Hi {name},</Text>
      <Text style={styles.text}>Your {appName} account is ready. Sign in to finish setting things up.</Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href={loginUrl} style={styles.button}>
          Sign in to {appName}
        </Button>
      </Section>
      <Text style={styles.muted}>If the button does not work, copy this link into your browser: {loginUrl}</Text>
    </Layout>
  );
}

Welcome.PreviewProps = PreviewProps;
export default Welcome;
