import { PageSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <PageSkeleton rows={6} columns={5} filters={false} />;
}
