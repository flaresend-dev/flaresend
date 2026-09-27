"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createApiKeyAction } from "@/app/actions";
import { useAutoOpen } from "@/lib/use-auto-open";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Expiry = "never" | "30" | "90" | "custom";

function expiresAt(expiry: Expiry, custom: string): string {
  if (expiry === "never") return "";
  if (expiry === "custom") return custom ? new Date(`${custom}T23:59:59`).toISOString() : "";
  return new Date(Date.now() + Number(expiry) * 86_400_000).toISOString();
}

/** "Create API key" dialog; on success the one-time key opens in the reveal dialog. `?new=1` opens it. */
export function CreateApiKeyButton({ slug, label = "Create API key", autoOpen = true }: { slug: string; label?: string; autoOpen?: boolean }) {
  const [open, setOpen] = useAutoOpen("new", autoOpen);
  const [expiry, setExpiry] = useState<Expiry>("never");
  const [custom, setCustom] = useState("");
  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setExpiry("never");
          setCustom("");
        }
      }}
      trigger={
        <Button variant="primary">
          <Plus /> {label}
        </Button>
      }
      title="Create API key"
      action={createApiKeyAction.bind(null, slug)}
      submitLabel="Create"
      secretTitle="Copy your API key"
      submitDisabled={expiry === "custom" && !custom}
    >
      <Field label="Name" htmlFor="k-name" description="Something you will recognise later, like the server that uses it.">
        <Input id="k-name" name="name" required autoFocus placeholder="production server" />
      </Field>
      <Field label="Mode" description="Test keys record emails but never send them.">
        <Select
          name="mode"
          defaultValue="live"
          ariaLabel="Mode"
          options={[
            { value: "live", label: "Live", description: "Sends real email. Starts with fs_live_" },
            { value: "test", label: "Test", description: "Records emails, never sends. Starts with fs_test_" },
          ]}
        />
      </Field>
      <Field label="Expiration">
        <div className="flex flex-wrap gap-2">
          <Select
            ariaLabel="Expiration"
            className="w-40"
            value={expiry}
            onValueChange={(v) => setExpiry(v as Expiry)}
            options={[
              { value: "never", label: "Never" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
              { value: "custom", label: "Custom date" },
            ]}
          />
          {expiry === "custom" ? (
            <Input type="date" aria-label="Expires on" className="w-44" value={custom} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setCustom(e.target.value)} required />
          ) : null}
        </div>
        <input type="hidden" name="expiresAt" value={expiresAt(expiry, custom)} />
      </Field>
    </FormDialog>
  );
}
