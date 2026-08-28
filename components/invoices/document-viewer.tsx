"use client"

import { useState } from "react"
import { Download, LoaderCircle, Maximize2, Minus, Plus, RotateCw } from "lucide-react"

type DocumentViewerProps = {
  url: string
  contentType?: string
  fileName?: string
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.25

export function DocumentViewer({ url, contentType, fileName }: DocumentViewerProps) {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)

  const isPdf = contentType === "application/pdf"

  const zoomIn = () => setZoom((value) => Math.min(MAX_ZOOM, Math.round((value + ZOOM_STEP) * 100) / 100))
  const zoomOut = () => setZoom((value) => Math.max(MIN_ZOOM, Math.round((value - ZOOM_STEP) * 100) / 100))
  const rotate = () => setRotation((value) => (value + 90) % 360)
  const reset = () => { setZoom(1); setRotation(0) }

  const transform = `scale(${zoom}) rotate(${rotation}deg)`

  if (!url) {
    return (
      <div className="grid min-h-[570px] place-items-center rounded-xl bg-[#0a0a0a]">
        <LoaderCircle className="h-5 w-5 animate-spin text-[#86efac]" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between rounded-lg border border-[#242424] bg-[#111] px-2 py-1.5">
        <div className="flex items-center gap-1">
          <ToolbarButton label="Zoom out" onClick={zoomOut} disabled={zoom <= MIN_ZOOM}><Minus className="h-3.5 w-3.5" /></ToolbarButton>
          <span className="w-12 text-center text-[10px] tabular-nums text-[#888]">{Math.round(zoom * 100)}%</span>
          <ToolbarButton label="Zoom in" onClick={zoomIn} disabled={zoom >= MAX_ZOOM}><Plus className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton label="Rotate" onClick={rotate}><RotateCw className="h-3.5 w-3.5" /></ToolbarButton>
          <ToolbarButton label="Fit to view" onClick={reset}><Maximize2 className="h-3.5 w-3.5" /></ToolbarButton>
        </div>
        <a
          href={url}
          download={fileName}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-md border border-[#303030] px-2 py-1 text-[10px] text-[#888] hover:text-[#ddd]"
        >
          <Download className="h-3.5 w-3.5" />Download
        </a>
      </div>
      <div className="grid min-h-[520px] place-items-center overflow-auto rounded-xl bg-[#0a0a0a]">
        {isPdf ? (
          <div className="h-[520px] w-full origin-center transition-transform" style={{ transform }}>
            <iframe title="Invoice PDF" src={url} className="h-full w-full border-0" />
          </div>
        ) : (
          <img
            src={url}
            alt={fileName || "Invoice"}
            className="max-h-[520px] max-w-full origin-center object-contain transition-transform"
            style={{ transform }}
          />
        )}
      </div>
    </div>
  )
}

function ToolbarButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-7 w-7 place-items-center rounded-md text-[#888] hover:bg-[#1c1c1c] hover:text-[#ddd] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}
