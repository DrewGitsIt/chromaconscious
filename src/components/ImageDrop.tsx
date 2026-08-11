import { useRef, useState } from 'react'
import type { ColorCandidate } from '../engine'
import { extractCandidates } from '../engine'
import './ImageDrop.css'

interface Props {
  onExtract: (candidates: ColorCandidate[]) => void
}

// Formats Chrome decodes natively; HEIC/HEIF goes through a WASM decoder.
const NATIVE_EXT = /\.(png|jpe?g|webp|avif|gif|bmp|ico|svg)$/i
const HEIC_EXT = /\.(heic|heif)$/i
const SUPPORTED_LABEL = 'png · jpg · webp · avif · gif · bmp · svg · heic'

function isSupported(file: File): boolean {
  return (
    file.type.startsWith('image/') || NATIVE_EXT.test(file.name) || HEIC_EXT.test(file.name)
  )
}

/**
 * The full file → color-candidates pipeline, shared by every image entry
 * point (dropzone, start-over menu, window-wide drop). Throws with a
 * user-facing message on unsupported/undecodable files or colorless images.
 */
export async function fileToCandidates(file: File): Promise<ColorCandidate[]> {
  if (!isSupported(file)) {
    throw new Error(`Unsupported file "${file.name}" — supported: ${SUPPORTED_LABEL}`)
  }
  let pixels: Uint8ClampedArray
  try {
    pixels = await fileToPixels(file)
  } catch (err) {
    console.error(err)
    throw new Error(`Couldn't decode "${file.name}" — supported: ${SUPPORTED_LABEL}`)
  }
  const candidates = extractCandidates(pixels)
  if (candidates.length === 0) throw new Error('No usable colors found in that image.')
  return candidates
}

/** Decode any supported file to raw RGBA pixels, downsampled for quantization. */
async function fileToPixels(file: File): Promise<Uint8ClampedArray> {
  let blob: Blob = file
  if (HEIC_EXT.test(file.name) || /hei[cf]/i.test(file.type)) {
    // Lazy-load the (large) WASM HEIC decoder only when actually needed.
    const { default: heic2any } = await import('heic2any')
    const converted = await heic2any({ blob: file, toType: 'image/png' })
    blob = Array.isArray(converted) ? converted[0] : converted
  }

  let source: ImageBitmap | HTMLImageElement
  let width: number
  let height: number
  try {
    const bitmap = await createImageBitmap(blob)
    source = bitmap
    width = bitmap.width
    height = bitmap.height
  } catch {
    // createImageBitmap rejects some formats (notably SVG); fall back to <img>.
    const url = URL.createObjectURL(blob)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      source = img
      width = img.naturalWidth || 256
      height = img.naturalHeight || 256
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0)
    }
  }

  // 128px is plenty for quantization and keeps extraction fast.
  const scale = Math.min(1, 128 / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(source, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h).data
}

export function ImageDrop({ onExtract }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (file: File) => {
    setError(null)
    setBusy(true)
    try {
      onExtract(await fileToCandidates(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div
        className={`image-drop ${over ? 'over' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const file = e.dataTransfer.files[0]
          if (file) void handleFile(file)
        }}
      >
        {busy ? (
          'extracting…'
        ) : (
          <>
            drop an image here (or click)
            <div className="image-drop-formats">{SUPPORTED_LABEL}</div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ''
          }}
        />
      </div>
      {error && <div className="image-drop-error">{error}</div>}
    </>
  )
}
