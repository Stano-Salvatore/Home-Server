"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, File as FileIcon, Trash2 } from "lucide-react";

type UploadedFile = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  kind: "image" | "document" | "other";
  brainDocumentId: string | null;
};

export default function FilesPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function fetchFiles() {
    return fetch("/api/files")
      .then((r) => r.json())
      .then((data) => data.files ?? []);
  }

  useEffect(() => {
    fetchFiles().then(setFiles);
  }, []);

  async function upload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const formData = new FormData();
        formData.append("file", file);
        await fetch("/api/files", { method: "POST", body: formData });
      }
      setFiles(await fetchFiles());
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/files/${id}`, { method: "DELETE" });
    setFiles(await fetchFiles());
  }

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-neutral-100 mb-1">Files</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Upload photos and documents. Text-extractable files (txt, markdown, PDF) get indexed into
        Brain automatically.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          upload(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`mb-6 rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          dragOver ? "border-indigo-500 bg-indigo-500/5" : "border-neutral-800 hover:border-neutral-700"
        }`}
      >
        <p className="text-sm text-neutral-400">
          {uploading ? "Uploading…" : "Drag and drop files here, or click to browse"}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-neutral-500">No files yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
          {files.map((file) => (
            <div key={file.id} className="group relative">
              <a
                href={`/api/files/${file.id}/content`}
                target="_blank"
                rel="noopener noreferrer"
                className="block aspect-square rounded-md overflow-hidden border border-neutral-800 bg-neutral-900 flex items-center justify-center"
              >
                {file.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/files/${file.id}/thumbnail`}
                    alt={file.originalName}
                    className="w-full h-full object-cover"
                  />
                ) : file.kind === "document" ? (
                  <FileText size={32} className="text-neutral-500" />
                ) : (
                  <FileIcon size={32} className="text-neutral-500" />
                )}
              </a>
              <button
                onClick={() => remove(file.id)}
                className="absolute top-1 right-1 p-1 rounded bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete"
              >
                <Trash2 size={14} className="text-red-400" />
              </button>
              <p className="text-xs text-neutral-400 truncate mt-1" title={file.originalName}>
                {file.originalName}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
