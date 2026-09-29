import { redirect } from "next/navigation";
import { ALL, p } from "@/lib/nav";

export default function AllProjectsRoot() {
  redirect(p(ALL, "emails"));
}
