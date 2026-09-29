"use client";

const PDF_MIME_TYPE = "application/pdf";
const MAX_RENDER_DIMENSION = 2200;

export function isPdfFile(file: File) {
  return file.type === PDF_MIME_TYPE || file.name.toLowerCase().endsWith(".pdf");
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create an image from this PDF page.")), "image/png");
  });
}

export async function convertPdfToImageFiles(file: File) {
  if (!isPdfFile(file)) return [file];

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const document = await loadingTask.promise;
  const baseName = file.name.replace(/\.pdf$/i, "") || "document";
  const images: File[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const originalViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(2, MAX_RENDER_DIMENSION / Math.max(originalViewport.width, originalViewport.height));
      const viewport = page.getViewport({ scale });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      await page.render({ canvas, viewport, background: "#ffffff" }).promise;
      const blob = await canvasToPng(canvas);
      images.push(new File([blob], `${baseName}-page-${pageNumber}.png`, { type: "image/png", lastModified: file.lastModified }));
      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await document.destroy();
  }

  return images;
}

export async function expandCanvasUploadFiles(files: File[]) {
  const expanded: File[] = [];
  for (const file of files) expanded.push(...await convertPdfToImageFiles(file));
  return expanded;
}
