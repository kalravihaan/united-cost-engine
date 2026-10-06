"use client";
import * as React from "react";
import { ImageIcon, RefreshCw } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/primitives";
import { FileDrop } from "@/components/ui/filedrop";
import { useToast } from "@/components/ui/toast";
import { api } from "@/features/costing/api";

export function StylePanel({ styleId, styleNumber, imageUrl, onChanged }: { styleId: string | null; styleNumber?: string; imageUrl: string | null; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const toast = useToast();
  const upload = async (f: File) => {
    if (!styleId) return;
    setBusy(true);
    try {
      await api.uploadImage(styleId, f);
      toast.push({ kind: "ok", title: "Style image saved" });
      onChanged();
    } catch (e) {
      toast.push({ kind: "error", title: "Image upload failed", body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader
        title="Style image"
        subtitle={styleNumber ? `Style ${styleNumber}` : "Select a style first"}
        actions={
          imageUrl && styleId ? (
            <label className="inline-flex">
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <span className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-line-strong px-2 text-[12px] font-medium text-ink-2 hover:bg-surface-2">
                <RefreshCw size={12} /> Replace
              </span>
            </label>
          ) : undefined
        }
      />
      <div className="p-3">
        {imageUrl ? (
          <a href={imageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-line bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={`Style ${styleNumber ?? ""}`} className="mx-auto max-h-[300px] w-full object-contain" />
          </a>
        ) : styleId ? (
          <FileDrop accept="image/png,image/jpeg,image/webp" onFile={upload} busy={busy} title="Drop the style image here" hint="PNG, JPEG or WebP · up to 12 MB" />
        ) : (
          <div className="flex h-[150px] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line bg-surface-2 text-ink-3">
            <ImageIcon size={22} />
            <span className="text-[12px]">The image can be added once a style is selected</span>
          </div>
        )}
      </div>
    </Card>
  );
}
