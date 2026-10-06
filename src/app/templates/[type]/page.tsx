import { TemplateEditor } from "@/features/templates/TemplateEditor";

export default async function Page({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  return <TemplateEditor type={type.toUpperCase() === "ACTUAL" ? "ACTUAL" : "CLIENT"} />;
}
