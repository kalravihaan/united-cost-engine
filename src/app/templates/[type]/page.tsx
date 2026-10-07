import { TemplateEditor } from "@/features/templates/TemplateEditor";

export default async function Page({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<{ format?: string }> }) {
  const { type } = await params;
  const { format } = await searchParams;
  return <TemplateEditor type={type.toUpperCase() === "ACTUAL" ? "ACTUAL" : "CLIENT"} format={format} />;
}
