import { PageSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <PageSkeleton rows={4} columns={6} filters={false} />;
}
