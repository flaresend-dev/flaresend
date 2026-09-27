import { PageSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <PageSkeleton rows={8} columns={3} filters={false} />;
}
