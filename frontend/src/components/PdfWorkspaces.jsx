import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Download, FileText, LoaderCircle, Plus, RefreshCw, ShieldCheck, Trash2, Upload, X } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

const pdfAccept = '.pdf,application/pdf'
const imageAccept = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function DropZone({ accept, multiple = false, onFiles, title, disabled = false }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  function take(files) {
    onFiles(Array.from(files || []))
    if (inputRef.current) inputRef.current.value = ''
  }
  return <div className={`upload-zone ${dragging ? 'is-dragging' : ''} ${disabled ? 'is-disabled' : ''}`} role="button" tabIndex={disabled ? -1 : 0} aria-label={title}
    onClick={() => !disabled && inputRef.current?.click()}
    onKeyDown={(event) => { if (!disabled && ['Enter', ' '].includes(event.key)) { event.preventDefault(); inputRef.current?.click() } }}
    onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true) }} onDragLeave={() => setDragging(false)}
    onDrop={(event) => { event.preventDefault(); setDragging(false); if (!disabled) take(event.dataTransfer.files) }}>
    <input ref={inputRef} type="file" accept={accept} multiple={multiple} hidden disabled={disabled} onChange={(event) => take(event.target.files)} />
    <span className="upload-icon"><Upload size={21} /></span><span className="upload-title">{title}</span><span className="upload-hint"><strong>Click to browse</strong> or drag and drop</span>
  </div>
}

function ResultDownload({ result, onReset }) {
  return <div className="pdf-result-card"><span className="conversion-file-icon"><Check size={22} /></span><div className="conversion-file-meta"><strong>{result.name}</strong><small>{formatBytes(result.size)}</small></div><a className="button-primary" href={result.url} download={result.name}><Download size={16} /> Download PDF</a><button className="text-button pdf-reset" onClick={onReset}><RefreshCw size={14} /> Start again</button></div>
}

function useOutputUrl() {
  const previous = useRef('')
  const [result, setResult] = useState(null)
  useEffect(() => () => { if (previous.current) URL.revokeObjectURL(previous.current) }, [])
  function setBlob(blob, name) {
    if (previous.current) URL.revokeObjectURL(previous.current)
    const url = URL.createObjectURL(blob)
    previous.current = url
    setResult({ url, name, size: blob.size })
  }
  function clear() {
    if (previous.current) URL.revokeObjectURL(previous.current)
    previous.current = ''
    setResult(null)
  }
  return [result, setBlob, clear]
}

export function PdfCompressor() {
  const [file, setFile] = useState(null)
  const [quality, setQuality] = useState('preserve')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [message, setMessage] = useState('')
  const [result, setResult, clearResult] = useOutputUrl()
  function choose(files) {
    const candidate = files[0]
    setMessage('')
    clearResult()
    if (!candidate || !/\.pdf$/i.test(candidate.name) || (candidate.type && candidate.type !== 'application/pdf')) {
      setFile(null)
      setMessage('Choose a PDF file.')
      return
    }
    if (candidate.size > 35 * 1024 * 1024) {
      setFile(null)
      setMessage('Choose a PDF under 35 MB for in-browser compression.')
      return
    }
    setFile(candidate)
  }
  async function compress() {
    if (!file || busy) return
    setBusy(true); setMessage('')
    let source
    try {
      if (quality === 'preserve') {
        const editablePdf = await PDFDocument.load(await file.arrayBuffer())
        const blob = new Blob([await editablePdf.save({ useObjectStreams: true })], { type: 'application/pdf' })
        const name = `${file.name.replace(/\.pdf$/i, '')}-optimized.pdf`
        setBlob(blob, name)
        setMessage(blob.size <= file.size ? `Optimized while keeping text and vector content. ${formatBytes(file.size)} → ${formatBytes(blob.size)}.` : `Content was preserved. Re-saving did not reduce this file (${formatBytes(file.size)} → ${formatBytes(blob.size)}).`)
        return
      }
      source = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
      if (source.numPages > 35) throw new Error('For browser performance, choose a PDF with 35 pages or fewer.')
      const setting = quality === 'compact' ? { maxDimension: 1050, jpeg: 0.58 } : quality === 'print' ? { maxDimension: 1900, jpeg: 0.86 } : { maxDimension: 1450, jpeg: 0.73 }
      const output = await PDFDocument.create()
      for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber++) {
        setProgress(`Compressing page ${pageNumber} of ${source.numPages}…`)
        const page = await source.getPage(pageNumber)
        const baseViewport = page.getViewport({ scale: 1 })
        const maxPixels = 14_000_000
        const pixelScale = Math.min(setting.maxDimension / Math.max(baseViewport.width, baseViewport.height), Math.sqrt(maxPixels / (baseViewport.width * baseViewport.height)))
        const viewport = page.getViewport({ scale: Math.max(0.1, pixelScale) })
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.ceil(viewport.width))
        canvas.height = Math.max(1, Math.ceil(viewport.height))
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) throw new Error('This browser could not prepare a PDF page.')
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvasContext: context, viewport, background: '#ffffff' }).promise
        const jpegBlob = await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The browser could not encode a PDF page.')), 'image/jpeg', setting.jpeg))
        const jpeg = await output.embedJpg(await jpegBlob.arrayBuffer())
        const targetPage = output.addPage([baseViewport.width, baseViewport.height])
        targetPage.drawImage(jpeg, { x: 0, y: 0, width: baseViewport.width, height: baseViewport.height })
        canvas.width = 0; canvas.height = 0
        page.cleanup()
      }
      const bytes = await output.save({ useObjectStreams: true })
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const name = `${file.name.replace(/\.pdf$/i, '')}-compressed.pdf`
      setBlob(blob, name)
      setMessage(blob.size < file.size ? `Reduced from ${formatBytes(file.size)} to ${formatBytes(blob.size)}.` : `Created a visual copy (${formatBytes(blob.size)}). This file is larger than the original, so keep the original for a smaller file.`)
    } catch (error) {
      setMessage(error?.message || 'We could not compress this PDF. Try another file.')
    } finally {
      await source?.destroy().catch(() => {})
      setProgress(''); setBusy(false)
    }
  }
  function reset() { clearResult(); setFile(null); setMessage('') }
  return <div className="workspace-card document-workspace">
    <div className="workspace-heading"><div><span className="workspace-kicker"><FileText size={15} /> Local PDF optimizer</span><h2>Make a lighter PDF</h2><p>Preserve document content or choose visual compression for scanned pages.</p></div><span className="workspace-privacy"><ShieldCheck size={15} /> Processed locally</span></div>
    {!file ? <DropZone accept={pdfAccept} onFiles={choose} title="Drop a PDF file here · up to 35 MB" /> : result ? <ResultDownload result={result} onReset={reset} /> : <div className="conversion-file-card"><span className="conversion-file-icon"><FileText size={23} /></span><div className="conversion-file-meta"><strong>{file.name}</strong><small>{formatBytes(file.size)} · PDF</small></div><button className="icon-button remove-mini" disabled={busy} onClick={reset} aria-label="Remove selected PDF"><X size={16} /></button><label className="field-label pdf-quality">Compression method<select value={quality} disabled={busy} onChange={(event) => setQuality(event.target.value)}><option value="preserve">Optimize · keep text &amp; layout</option><option value="compact">Visual · smallest file</option><option value="balanced">Visual · balanced quality</option><option value="print">Visual · higher detail</option></select></label><button className="button-primary convert-button" disabled={busy} onClick={compress}>{busy ? <><LoaderCircle size={17} className="spin" /> {progress || 'Working…'}</> : <>{quality === 'preserve' ? 'Optimize PDF' : 'Compress PDF'} <ArrowDown size={17} /></>}</button></div>}
    {message && <div className={`status-message ${result ? 'is-success' : ''}`} role="status">{result ? <Check size={16} /> : <RefreshCw size={15} />}{message}</div>}
    <div className="conversion-note"><span className="note-mark">i</span><p><strong>{quality === 'preserve' ? 'Content-preserving optimization keeps selectable text and vectors.' : 'Visual compression rebuilds pages as JPEG images.'}</strong> {quality === 'preserve' ? 'This re-saves the PDF structure; image-heavy files may not become smaller.' : 'This can remove selectable text, links, forms and accessibility structure. Compare the result before replacing your original; text-heavy PDFs may grow in size.'}</p></div>
    <div className="workspace-footnote"><ShieldCheck size={14} /> PDF pages are rendered in your browser and are not uploaded.</div>
  </div>
}

export function PdfSplitter() {
  const [file, setFile] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [ranges, setRanges] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [result, setBlob, clearResult] = useOutputUrl()
  async function choose(files) {
    const candidate = files[0]
    setMessage(''); clearResult(); setFile(null); setPageCount(0); setRanges('')
    if (!candidate || !/\.pdf$/i.test(candidate.name) || (candidate.type && candidate.type !== 'application/pdf')) return setMessage('Choose a PDF file.')
    if (candidate.size > 80 * 1024 * 1024) return setMessage('Choose a PDF under 80 MB.')
    try {
      const input = await PDFDocument.load(await candidate.arrayBuffer())
      setFile(candidate); setPageCount(input.getPageCount()); setRanges(`1-${input.getPageCount()}`)
    } catch { setMessage('This PDF could not be opened. It may be damaged or password-protected.') }
  }
  function parseRanges(value) {
    const pages = []
    const parts = value.split(',').map((part) => part.trim())
    if (!parts.length || parts.some((part) => !part)) throw new Error('Enter page numbers and ranges, such as 1-3, 5.')
    for (const part of parts) {
      const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/)
      if (!match) throw new Error('Use page numbers and ranges such as 1-3, 5, 8-10.')
      const start = Number(match[1]); const end = Number(match[2] || match[1])
      if (start < 1 || end < start || end > pageCount) throw new Error(`Page ranges must be within 1 and ${pageCount}.`)
      for (let page = start; page <= end; page++) {
        if (pages.includes(page - 1)) throw new Error(`Page ${page} is listed more than once.`)
        pages.push(page - 1)
      }
    }
    return pages
  }
  async function split() {
    if (!file || busy) return
    setBusy(true); setMessage('')
    try {
      const selectedPages = parseRanges(ranges)
      const input = await PDFDocument.load(await file.arrayBuffer())
      const output = await PDFDocument.create()
      const copied = await output.copyPages(input, selectedPages)
      copied.forEach((page) => output.addPage(page))
      const blob = new Blob([await output.save({ useObjectStreams: true })], { type: 'application/pdf' })
      setBlob(blob, `${file.name.replace(/\.pdf$/i, '')}-pages.pdf`)
      setMessage(`Extracted ${selectedPages.length} page${selectedPages.length === 1 ? '' : 's'} from ${pageCount}.`)
    } catch (error) { setMessage(error?.message || 'We could not split this PDF.') }
    finally { setBusy(false) }
  }
  function reset() { clearResult(); setFile(null); setPageCount(0); setRanges(''); setMessage('') }
  return <div className="workspace-card document-workspace">
    <div className="workspace-heading"><div><span className="workspace-kicker"><FileText size={15} /> PDF page extraction</span><h2>Choose the pages to keep</h2><p>Enter a page number or range. The extracted PDF follows the order you enter.</p></div><span className="workspace-privacy"><ShieldCheck size={15} /> Processed locally</span></div>
    {!file ? <DropZone accept={pdfAccept} onFiles={choose} title="Drop a PDF file here" /> : result ? <ResultDownload result={result} onReset={reset} /> : <div className="split-pdf-panel"><div className="conversion-file-card"><span className="conversion-file-icon"><FileText size={23} /></span><div className="conversion-file-meta"><strong>{file.name}</strong><small>{formatBytes(file.size)} · {pageCount} page{pageCount === 1 ? '' : 's'}</small></div><button className="icon-button remove-mini" onClick={reset} disabled={busy} aria-label="Remove PDF"><X size={16} /></button></div><label className="field-label">Pages to extract<input value={ranges} disabled={busy} onChange={(event) => setRanges(event.target.value)} placeholder="Example: 1-3, 5, 8-10" aria-describedby="split-hint" /><small id="split-hint" className="field-note">{pageCount} pages available · separate entries with commas</small></label><button className="button-primary workspace-action" onClick={split} disabled={busy}>{busy ? <><LoaderCircle size={17} className="spin" /> Preparing pages…</> : <>Create extracted PDF <ArrowDown size={17} /></>}</button></div>}
    {message && <div className={`status-message ${result ? 'is-success' : ''}`} role="status">{result ? <Check size={16} /> : <RefreshCw size={15} />}{message}</div>}
    <div className="workspace-footnote"><ShieldCheck size={14} /> The source PDF stays on your device.</div>
  </div>
}

export function ImageToPdf() {
  const [items, setItems] = useState([])
  const [pageSize, setPageSize] = useState('a4')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [message, setMessage] = useState('')
  const [result, setBlob, clearResult] = useOutputUrl()
  function addFiles(files) {
    const accepted = []
    let warning = ''
    const total = items.reduce((sum, item) => sum + item.file.size, 0)
    for (const file of files) {
      const isImage = /\.(jpe?g|png|webp)$/i.test(file.name) && (!file.type || ['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      if (!isImage) { warning = 'Choose JPG, PNG or WebP images.'; continue }
      if (file.size === 0 || file.size > 20 * 1024 * 1024 || total + accepted.reduce((sum, item) => sum + item.file.size, 0) + file.size > 80 * 1024 * 1024 || items.length + accepted.length >= 25) { warning = 'Use up to 25 images, 20 MB each and 80 MB total.'; break }
      accepted.push({ id: `${Date.now()}-${Math.random()}`, file })
    }
    if (accepted.length) { setItems((current) => [...current, ...accepted]); setMessage(''); clearResult() }
    if (warning) setMessage(warning)
  }
  function move(index, direction) {
    setItems((current) => { const next = [...current]; const target = index + direction; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next })
  }
  function remove(id) { setItems((current) => current.filter((item) => item.id !== id)); clearResult(); setMessage('') }
  async function createPdf() {
    if (!items.length || busy) return
    setBusy(true); setMessage('')
    try {
      const output = await PDFDocument.create()
      for (let index = 0; index < items.length; index++) {
        const { file } = items[index]
        setProgress(`Adding image ${index + 1} of ${items.length}…`)
        const image = await loadImage(file)
        const jpeg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name)
        const imageBytes = jpeg ? new Uint8Array(await file.arrayBuffer()) : file.type === 'image/png' || /\.png$/i.test(file.name) ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array(await (await imageToJpeg(image, 0.9)).arrayBuffer())
        const embedded = jpeg ? await output.embedJpg(imageBytes) : await output.embedPng(imageBytes)
        let pageWidth; let pageHeight
        if (pageSize === 'original') { pageWidth = Math.max(72, image.width * 0.75); pageHeight = Math.max(72, image.height * 0.75) }
        else { const landscape = image.width > image.height; pageWidth = landscape ? 842 : 595; pageHeight = landscape ? 595 : 842 }
        const margin = pageSize === 'a4' ? 30 : 0
        const fit = Math.min((pageWidth - margin * 2) / embedded.width, (pageHeight - margin * 2) / embedded.height)
        const drawWidth = embedded.width * fit; const drawHeight = embedded.height * fit
        const page = output.addPage([pageWidth, pageHeight])
        page.drawImage(embedded, { x: (pageWidth - drawWidth) / 2, y: (pageHeight - drawHeight) / 2, width: drawWidth, height: drawHeight })
      }
      const blob = new Blob([await output.save({ useObjectStreams: true })], { type: 'application/pdf' })
      setBlob(blob, 'images.pdf')
      setMessage(`Created a ${items.length}-page PDF.`)
    } catch (error) { setMessage(error?.message || 'We could not create the PDF. Try another image.') }
    finally { setProgress(''); setBusy(false) }
  }
  function reset() { clearResult(); setItems([]); setMessage('') }
  return <div className="workspace-card document-workspace">
    <div className="workspace-heading"><div><span className="workspace-kicker"><FileText size={15} /> Image to PDF</span><h2>Build a PDF from images</h2><p>Each image becomes a page. Change their order before creating the file.</p></div><span className="workspace-privacy"><ShieldCheck size={15} /> Processed locally</span></div>
    {!items.length ? <DropZone accept={imageAccept} multiple onFiles={addFiles} title="Drop JPG, PNG or WebP images here" /> : result ? <ResultDownload result={result} onReset={reset} /> : <>
      <div className="pdf-image-controls"><label className="field-label">Page size<select value={pageSize} disabled={busy} onChange={(event) => setPageSize(event.target.value)}><option value="a4">A4 · fit image to page</option><option value="original">Match image dimensions</option></select></label><span>{items.length}/25 images</span></div>
      <div className="pdf-image-list">{items.map((item, index) => <div className="pdf-image-row" key={item.id}><span className="pdf-image-number">{index + 1}</span><span className="conversion-file-icon"><FileText size={19} /></span><div className="conversion-file-meta"><strong title={item.file.name}>{item.file.name}</strong><small>{formatBytes(item.file.size)} · {item.file.type.split('/')[1]?.toUpperCase() || 'IMAGE'}</small></div><button className="icon-button" onClick={() => move(index, -1)} disabled={busy || index === 0} aria-label={`Move ${item.file.name} up`}><ArrowUp size={15} /></button><button className="icon-button" onClick={() => move(index, 1)} disabled={busy || index === items.length - 1} aria-label={`Move ${item.file.name} down`}><ArrowDown size={15} /></button><button className="icon-button remove-mini" onClick={() => remove(item.id)} disabled={busy} aria-label={`Remove ${item.file.name}`}><Trash2 size={15} /></button></div>)}</div>
      <div className="pdf-image-actions"><button className="text-button" onClick={() => document.getElementById('pdf-image-add')?.click()} disabled={busy}><Plus size={15} /> Add more images</button><input id="pdf-image-add" type="file" accept={imageAccept} multiple hidden disabled={busy} onChange={(event) => { addFiles(Array.from(event.target.files || [])); event.target.value = '' }} /><button className="button-primary" onClick={createPdf} disabled={busy}>{busy ? <><LoaderCircle size={17} className="spin" /> {progress || 'Working…'}</> : <>Create PDF <ArrowDown size={17} /></>}</button></div>
    </>}
    {message && <div className={`status-message ${result ? 'is-success' : ''}`} role="status">{result ? <Check size={16} /> : <RefreshCw size={15} />}{message}</div>}
    <div className="workspace-footnote"><ShieldCheck size={14} /> Images are processed in your browser.</div>
  </div>
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name} could not be opened as an image.`)) }
    image.src = url
  })
}

function imageToJpeg(image, quality) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 5000 / Math.max(image.naturalWidth, image.naturalHeight), Math.sqrt(18_000_000 / (image.naturalWidth * image.naturalHeight)))
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) return reject(new Error('This browser could not prepare an image.'))
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => { canvas.width = 0; canvas.height = 0; blob ? resolve(blob) : reject(new Error('WebP conversion failed.')) }, 'image/jpeg', quality)
  })
}
