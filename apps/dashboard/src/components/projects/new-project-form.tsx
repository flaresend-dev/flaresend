"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProjectAction } from "@/app/actions";
import { p, slugError, slugify } from "@/lib/nav";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SwitchField } from "@/components/ui/switch";

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const shownSlug = slugTouched ? slug : slugify(name);
  const error = shownSlug ? slugError(shownSlug) : null;

  return (
    <Card>
      <ActionForm
        action={createProjectAction}
        className="gap-0"
        statusClassName="mx-5 mb-4 w-auto"
        onSuccess={(s) => router.push(p(String(s.data), "domains"))}
        footer={
          <CardFooter>
            <SubmitButton disabled={Boolean(error) || !shownSlug || !name.trim()}>Create project</SubmitButton>
          </CardFooter>
        }
      >
        <CardContent className="flex flex-col gap-5 pt-5">
          <Field label="Name" htmlFor="name">
            <Input id="name" name="name" required autoFocus placeholder="Acme" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Slug" htmlFor="slug" error={error} description="Used in URLs and the API. Slugs are permanent.">
            <Input
              id="slug"
              name="slug"
              required
              className="font-mono"
              placeholder="acme"
              value={shownSlug}
              aria-invalid={Boolean(error) || undefined}
              spellCheck={false}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
            />
          </Field>
          <Field label="Domain" htmlFor="domain" description="The domain you send from. You can add more later.">
            <Input id="domain" name="allowedDomains" required placeholder="acme.com" className="font-mono" spellCheck={false} />
          </Field>
          <Field label="Default sender" htmlFor="defaultFrom" optional description="Used when a send has no from address.">
            <Input id="defaultFrom" name="defaultFrom" placeholder="Acme <hello@acme.com>" />
          </Field>
          <Field label="Daily sending limit" htmlFor="dailyLimit" description="Emails per UTC day. 0 means no limit.">
            <Input id="dailyLimit" name="dailyLimit" type="number" min={0} defaultValue={5000} className="w-40 tabular-nums" />
          </Field>
          <SwitchField
            name="rpcEnabled"
            defaultChecked
            label="Allow Workers to send over RPC"
            description="Other Workers in your account can send for this project through the MailerRpc service binding."
          />
        </CardContent>
      </ActionForm>
    </Card>
  );
}
