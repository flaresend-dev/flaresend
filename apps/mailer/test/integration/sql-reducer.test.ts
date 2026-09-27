import { describe, expect, it } from "vitest";
import type { EmailStatus } from "@flaresend/types";
import { recipientNoDowngradeSql, REDUCE_EMAIL_STATUS_SQL, reduceEmailStatus, shouldUpdateRecipient } from "../../src/core/status";
import { env, setupProject } from "../helpers";

const STATUSES = ["sent", "deferred", "delivered", "failed", "rejected", "bounced", "complained"];
const EMAIL_START: EmailStatus[] = ["sent", "deferred", "delivered", "failed", "rejected", "bounced", "complained"];

describe("SQL mirrors of the status rules", () => {
  it("REDUCE_EMAIL_STATUS_SQL matches reduceEmailStatus for every 2-recipient combination", async () => {
    const { project } = await setupProject();
    let n = 0;
    for (const current of EMAIL_START) {
      for (const a of STATUSES) {
        for (const b of STATUSES) {
          const id = `email_sql_${n++}`;
          await env.DB.batch([
            env.DB.prepare(
              `INSERT INTO emails (id, project_id, mode, source, from_address, to_addresses, subject, size_bytes, status, created_at)
               VALUES (?, ?, 'live', 'http', 'a@b.co', '[]', 's', 0, ?, '2026-01-01')`,
            ).bind(id, project.id, current),
            env.DB.prepare("INSERT INTO email_recipients (id, email_id, address, kind, status) VALUES (?, ?, 'a@x.co', 'to', ?)").bind(`${id}_a`, id, a),
            env.DB.prepare("INSERT INTO email_recipients (id, email_id, address, kind, status) VALUES (?, ?, 'b@x.co', 'to', ?)").bind(`${id}_b`, id, b),
            env.DB.prepare(REDUCE_EMAIL_STATUS_SQL).bind(id, "T"),
          ]);
          const row = await env.DB.prepare("SELECT status FROM emails WHERE id = ?").bind(id).first<{ status: string }>();
          expect(row?.status, `${current} [${a}, ${b}]`).toBe(reduceEmailStatus(current, [a, b]));
        }
      }
    }
  });

  it("recipientNoDowngradeSql matches shouldUpdateRecipient", async () => {
    for (const cur of ["queued", ...STATUSES]) {
      for (const incoming of STATUSES) {
        const r = await env.DB.prepare(`SELECT ${recipientNoDowngradeSql("?2", "?1")} AS ok`).bind(incoming, cur).first<{ ok: number }>();
        expect(r?.ok === 1, `${cur} <- ${incoming}`).toBe(shouldUpdateRecipient(cur, incoming));
      }
    }
  });
});
