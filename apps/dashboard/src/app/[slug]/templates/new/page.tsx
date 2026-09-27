import type { SlugParams } from "@/lib/project";
import { TemplateEditor } from "@/components/template-editor";

export const metadata = { title: "New template" };

export default async function NewTemplatePage({ params }: SlugParams) {
  const { slug } = await params;
  return <TemplateEditor slug={slug} template={null} versions={[]} />;
}
