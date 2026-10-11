import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Download, FileText, Image as ImageIcon, LoaderCircle, Plus, RefreshCw, ShieldCheck, SlidersHorizontal, Upload, X } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import { useNavigate } from 'react-router-dom'
import { conversions } from '../data/tools.js'

const imageAccept = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'
const PdfCompressor = lazy(() => import('./PdfWorkspaces.jsx').then((module) => ({ default: module.PdfCompressor })))
const PdfSplitter = lazy(() => import('./PdfWorkspaces.jsx').then((module) => ({ default: module.PdfSplitter })))
const ImageToPdf = lazy(() => import('./PdfWorkspaces.jsx').then((module) => ({ default: module.ImageToPdf })))
const ResumeBuilder = lazy(() => import('./CareerWorkspaces.jsx').then((module) => ({ default: module.ResumeBuilder })))
const CoverLetterBuilder = lazy(() => import('./CareerWorkspaces.jsx').then((module) => ({ default: module.CoverLetterBuilder })))

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function sourceImageType(file) {
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file.type
  if (/\.png$/i.test(file.name)) return 'image/png'
  if (/\.webp$/i.test(file.name)) return 'image/webp'
  return 'image/jpeg'
}

function DropZone({ accept, multiple, onFiles, disabled = false, title = 'Drop your files here' }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  function takeFiles(fileList) {
    onFiles(Array.from(fileList || []))
    if (inputRef.current) inputRef.current.value = ''
  }
  return <div className={`upload-zone ${dragging ? 'is-dragging' : ''} ${disabled ? 'is-disabled' : ''}`}
    role="button" tabIndex={disabled ? -1 : 0} aria-label={title}
    onClick={() => !disabled && inputRef.current?.click()}
    onKeyDown={(event) => { if (!disabled && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); inputRef.current?.click() } }}
    onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true) }}
    onDragLeave={() => setDragging(false)}
    onDrop={(event) => { event.preventDefault(); setDragging(false); if (!disabled) takeFiles(event.dataTransfer.files) }}>
    <input ref={inputRef} type="file" accept={accept} multiple={multiple} hidden disabled={disabled} onChange={(event) => takeFiles(event.target.files)} />
    <span className="upload-icon"><Upload size={21} /></span>
    <span className="upload-title">{title}</span>
    <span className="upload-hint"><strong>Click to browse</strong> or drag and drop</span>
  </div>
}

function ToolWorkspace({ tool, conversion }) {
  if (tool.slug === 'compress-pdf') return <Suspense fallback={<div className="workspace-card workspace-loading">Preparing your workspace…</div>}><PdfCompressor /></Suspense>
  if (tool.slug === 'split-pdf') return <Suspense fallback={<div className="workspace-card workspace-loading">Preparing your workspace…</div>}><PdfSplitter /></Suspense>
  if (tool.slug === 'image-to-pdf') return <Suspense fallback={<div className="workspace-card workspace-loading">Preparing your workspace…</div>}><ImageToPdf /></Suspense>
  if (tool.slug === 'resume-builder') return <Suspense fallback={<div className="workspace-card workspace-loading">Preparing your workspace…</div>}><ResumeBuilder /></Suspense>
  if (tool.slug === 'cover-letter-builder') return <Suspense fallback={<div className="workspace-card workspace-loading">Preparing your workspace…</div>}><CoverLetterBuilder /></Suspense>
  if (tool.group === 'calculator') {
    return tool.slug === 'emi-calculator' ? <EmiCalculator /> : <PercentageCalculator />
  }
  if (tool.slug === 'merge-pdf') return <PdfMerger />
  if (tool.slug === 'document-converter' || conversion) return <DocumentConverter selectedConversion={conversion} />
  return <ImageWorkspace converter={tool.slug === 'image-converter'} />
}

function ImageWorkspace({ converter }) {
  const [items, setItems] = useState([])
  const [format, setFormat] = useState('keep')
  const [quality, setQuality] = useState(82)
  const [maxWidth, setMaxWidth] = useState(1920)
  const [targetKb, setTargetKb] = useState(300)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const urls = useRef(new Set())
  const pngOnly = format === 'image/png' || (format === 'keep' && items.length > 0 && items.every((item) => sourceImageType(item.file) === 'image/png'))
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), [])

  function addFiles(files) {
    const supported = files.filter((file) => {
      const extensionMatches = /\.(jpe?g|png|webp)$/i.test(file.name)
      return extensionMatches && (!file.type || ['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    })
    let warning = supported.length !== files.length ? 'Choose JPG, PNG or WebP image files.' : ''
    let total = items.reduce((sum, item) => sum + item.file.size, 0)
    const additions = []
    for (const file of supported) {
      if (file.size === 0 || file.size > 20 * 1024 * 1024 || items.length + additions.length >= 10 || total + file.size > 80 * 1024 * 1024) {
        warning = 'Use up to 10 images, 20 MB each and 80 MB per batch.'
        break
      }
      const previewUrl = URL.createObjectURL(file)
      urls.current.add(previewUrl)
      additions.push({ id: `${Date.now()}-${Math.random()}`, file, previewUrl, output: null, outputUrl: null })
      total += file.size
    }
    if (additions.length && !warning) setMessage('')
    else if (warning) setMessage(warning)
    setItems((current) => [...current, ...additions])
  }

  function removeItem(item) {
    urls.current.delete(item.previewUrl); URL.revokeObjectURL(item.previewUrl)
    if (item.outputUrl) { urls.current.delete(item.outputUrl); URL.revokeObjectURL(item.outputUrl) }
    setItems((current) => current.filter((entry) => entry.id !== item.id))
  }

  async function processAll() {
    if (!items.length || busy) return
    const sizeLimitKb = Number(targetKb)
    if (!converter && (!Number.isFinite(sizeLimitKb) || sizeLimitKb < 20 || sizeLimitKb > 5000)) {
      setMessage('Set a target size between 20 KB and 5,000 KB.')
      return
    }
    setBusy(true); setMessage('')
    const next = []
    try {
      for (const item of items) {
        const image = new Image()
        image.src = item.previewUrl
        await image.decode()
        const longestSide = Math.max(image.naturalWidth, image.naturalHeight)
        const scale = Math.min(1, Number(maxWidth) / longestSide)
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
        const context = canvas.getContext('2d', { alpha: true })
        if (!context) throw new Error('Your browser could not prepare this image.')
        const requestedType = format === 'keep' ? sourceImageType(item.file) : format
        if (requestedType === 'image/jpeg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height) }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        let blob = await canvasToBlob(canvas, requestedType, quality / 100)
        const sizeLimit = sizeLimitKb * 1024
        if (!converter && requestedType !== 'image/png') {
          let currentQuality = quality / 100
          for (let attempt = 0; blob.size > sizeLimit && attempt < 7 && currentQuality > 0.32; attempt++) {
            currentQuality = Math.max(0.32, currentQuality - 0.09)
            blob = await canvasToBlob(canvas, requestedType, currentQuality)
          }
        }
        const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
        const stem = item.file.name.replace(/\.[^.]+$/, '')
        const outputName = `${stem}-${converter ? 'converted' : 'compressed'}.${ext}`
        const outputUrl = URL.createObjectURL(blob)
        urls.current.add(outputUrl)
        next.push({ ...item, output: blob, outputUrl, outputName })
      }
      items.forEach((item) => {
        if (item.outputUrl) { urls.current.delete(item.outputUrl); URL.revokeObjectURL(item.outputUrl) }
      })
      setItems(next)
      const exceeded = !converter && next.some((item) => item.output.size > sizeLimitKb * 1024)
      setMessage(exceeded ? 'Done. A few images stayed above the target size; a smaller target can reduce quality noticeably.' : 'Your files are ready to download.')
    } catch (error) {
      next.forEach((item) => {
        urls.current.delete(item.outputUrl)
        URL.revokeObjectURL(item.outputUrl)
      })
      setMessage(error?.message || 'This image could not be processed. Try another file.')
    } finally { setBusy(false) }
  }

  return <div className="workspace-card">
    <div className="workspace-heading"><div><span className="workspace-kicker"><ImageIcon size={15} /> {converter ? 'Image converter' : 'Image compressor'}</span><h2>{items.length ? `${items.length} image${items.length === 1 ? '' : 's'} selected` : 'Start with your images'}</h2><p>Files stay right here in your browser.</p></div><span className="workspace-privacy"><ShieldCheck size={15} /> Processed locally</span></div>
    {!items.length ? <DropZone accept={imageAccept} multiple onFiles={addFiles} title="Drop JPG, PNG or WebP files here" /> : <div className="image-workspace-body">
      <div className="settings-and-list">
        <div className="settings-panel"><div className="settings-title"><SlidersHorizontal size={16} /><strong>{converter ? 'Conversion settings' : 'Compression settings'}</strong></div>
          <label className="field-label">Output format<select disabled={busy} value={format} onChange={(event) => setFormat(event.target.value)}><option value="keep">Keep original format</option><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label>
          <label className="field-label">Maximum dimension<select disabled={busy} value={maxWidth} onChange={(event) => setMaxWidth(event.target.value)}><option value="3840">3840 px · original-size cap</option><option value="2560">2560 px · high resolution</option><option value="1920">1920 px · recommended</option><option value="1280">1280 px · web ready</option><option value="800">800 px · compact</option></select></label>
          <label className={`range-label ${pngOnly ? 'is-muted' : ''}`}><span>Quality <b>{quality}%</b></span><input type="range" min="35" max="100" value={quality} disabled={pngOnly || busy} onChange={(event) => setQuality(event.target.value)} /><small>{pngOnly ? 'PNG is lossless. Choose JPG or WebP to tune quality.' : 'Higher quality keeps more detail and uses more space.'}</small></label>
          {!converter && <label className="field-label">Target size (KB)<input type="number" min="20" max="5000" value={targetKb} disabled={busy} onChange={(event) => setTargetKb(event.target.value)} /><small className="field-note">{pngOnly ? 'PNG is lossless; choose JPG or WebP for a smaller target.' : 'A target is a guide. Final size depends on the image.'}</small></label>}
          <button className="button-primary workspace-action" onClick={processAll} disabled={busy || !items.length}>{busy ? <><LoaderCircle className="spin" size={17} /> Working…</> : <>{converter ? 'Convert images' : 'Compress images'} <ArrowDown size={17} /></>}</button>
          <button className="text-button add-more" disabled={busy} onClick={() => document.getElementById('image-add-more')?.click()}><Plus size={15} /> Add more images</button>
          <input id="image-add-more" type="file" accept={imageAccept} multiple hidden disabled={busy} onChange={(event) => { addFiles(Array.from(event.target.files || [])); event.target.value = '' }} />
        </div>
        <div className="file-results"><div className="file-results-title"><strong>Your files</strong><span>{items.length}/10</span></div>
          {items.map((item) => <div className="image-file-row" key={item.id}><img src={item.previewUrl} alt="" /><div className="image-file-meta"><strong title={item.file.name}>{item.file.name}</strong><small>{formatBytes(item.file.size)}{item.output && <span className="size-change"> → {formatBytes(item.output.size)}</span>}</small>{item.output && <small className="image-dimensions">{item.output.type.split('/')[1]?.toUpperCase()} · {item.outputName}</small>}</div>{item.output && <a className="icon-button download-mini" href={item.outputUrl} download={item.outputName} aria-label={`Download ${item.outputName}`}><Download size={16} /></a>}<button className="icon-button remove-mini" disabled={busy} onClick={() => removeItem(item)} aria-label={`Remove ${item.file.name}`}><X size={16} /></button></div>)}
        </div>
      </div>
      <div className="image-drop-more"><DropZone accept={imageAccept} multiple disabled={busy} onFiles={addFiles} title="Drop more images or click to add" /></div>
    </div>}
    {message && <div className={`status-message ${message.includes('ready') ? 'is-success' : ''}`} role="status">{message.includes('ready') ? <Check size={16} /> : <RefreshCw size={15} />}{message}</div>}
    <div className="workspace-footnote"><ShieldCheck size={14} /> Your original files are never changed.</div>
  </div>
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('This browser does not support that image format.')), type, quality))
}

function PdfMerger() {
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [result, setResult] = useState(null)
  const resultUrl = useRef(null)
  useEffect(() => () => resultUrl.current && URL.revokeObjectURL(resultUrl.current), [])
  function addFiles(incoming) {
    const valid = incoming.filter((file) => file.name.toLowerCase().endsWith('.pdf') && file.size <= 50 * 1024 * 1024)
    if (valid.length !== incoming.length) setMessage('Choose PDF files smaller than 50 MB each.')
    let total = files.reduce((sum, file) => sum + file.size, 0)
    const additions = []
    for (const file of valid) {
      if (files.length + additions.length >= 20 || total + file.size > 100 * 1024 * 1024) {
        setMessage('PDF merge is limited to 20 files and 100 MB per batch.')
        break
      }
      additions.push(file); total += file.size
    }
    setFiles([...files, ...additions])
    setResult(null)
    if (resultUrl.current) { URL.revokeObjectURL(resultUrl.current); resultUrl.current = null }
  }
  function move(index, direction) {
    setFiles((current) => { const next = [...current]; const target = index + direction; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next })
  }
  async function merge() {
    if (files.length < 2 || busy) return
    setBusy(true); setMessage('')
    try {
      const merged = await PDFDocument.create()
      for (const file of files) {
        const source = await PDFDocument.load(await file.arrayBuffer())
        const pages = await merged.copyPages(source, source.getPageIndices())
        pages.forEach((page) => merged.addPage(page))
      }
      const bytes = await merged.save()
      const blob = new Blob([bytes], { type: 'application/pdf' })
      resultUrl.current = URL.createObjectURL(blob)
      setResult({ url: resultUrl.current, size: blob.size, name: 'kraantitools-merged.pdf' })
      setMessage('Your merged PDF is ready.')
    } catch (error) {
      setMessage(error?.message?.toLowerCase().includes('encrypt') ? 'One of these PDFs is password protected. Remove its password first.' : 'One of these files could not be read as a PDF. Check the files and try again.')
    } finally { setBusy(false) }
  }
  function remove(index) {
    setFiles((current) => current.filter((_, position) => position !== index))
    setResult(null)
    if (resultUrl.current) { URL.revokeObjectURL(resultUrl.current); resultUrl.current = null }
  }
  return <div className="workspace-card">
    <div className="workspace-heading"><div><span className="workspace-kicker"><FileText size={15} /> PDF merger</span><h2>Bring your PDFs together</h2><p>Choose at least two files and arrange them in the order you want.</p></div><span className="workspace-privacy"><ShieldCheck size={15} /> Merged in browser</span></div>
    {!files.length ? <DropZone accept="application/pdf,.pdf" multiple onFiles={addFiles} title="Drop your PDF files here" /> : <div className="merge-layout"><div className="merge-file-list">{files.map((file, index) => <div className="merge-file-row" key={`${file.name}-${index}`}><span className="merge-order">{String(index + 1).padStart(2, '0')}</span><span className="merge-file-icon"><FileText size={19} /></span><div className="merge-file-meta"><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></div><div className="merge-reorder"><button className="icon-button" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${file.name} up`}><ArrowUp size={15} /></button><button className="icon-button" disabled={busy || index === files.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${file.name} down`}><ArrowDown size={15} /></button></div><button className="icon-button remove-mini" disabled={busy} onClick={() => remove(index)} aria-label={`Remove ${file.name}`}><X size={16} /></button></div>)}</div><div className="merge-side-panel"><div className="merge-side-count"><FileText size={20} /><strong>{files.length}</strong><span>PDF files</span></div><p>Pages stay in their original order inside each file.</p><button className="button-primary workspace-action" onClick={merge} disabled={files.length < 2 || busy}>{busy ? <><LoaderCircle size={17} className="spin" /> Merging…</> : <>Merge PDFs <ArrowDown size={17} /></>}</button>{files.length < 2 && <small className="field-note">Add one more PDF to merge.</small>}<button className="text-button add-more" disabled={busy} onClick={() => document.getElementById('pdf-add-more')?.click()}><Plus size={15} /> Add more PDFs</button><input id="pdf-add-more" type="file" accept="application/pdf,.pdf" multiple hidden disabled={busy} onChange={(event) => { addFiles(Array.from(event.target.files || [])); event.target.value = '' }} /></div></div>}
    {message && <div className={`status-message ${result ? 'is-success' : ''}`} role="status">{result ? <Check size={16} /> : <RefreshCw size={15} />}{message}{result && <a className="inline-download" href={result.url} download={result.name}><Download size={15} /> Download {formatBytes(result.size)}</a>}</div>}
    <div className="workspace-footnote"><ShieldCheck size={14} /> PDFs are read and merged on your device; nothing is uploaded.</div>
  </div>
}

function DocumentConverter({ selectedConversion }) {
  const navigate = useNavigate()
  const conversion = selectedConversion || conversions[0]
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrProgress, setOcrProgress] = useState('')
  const [ocrLanguage, setOcrLanguage] = useState('eng')
  const [message, setMessage] = useState('')
  const [result, setResult] = useState(null)
  const resultUrl = useRef(null)
  const requestRef = useRef(null)
  const ocrRequestRef = useRef(null)
  useEffect(() => () => resultUrl.current && URL.revokeObjectURL(resultUrl.current), [])
  useEffect(() => {
    requestRef.current?.abort()
    ocrRequestRef.current?.abort()
    requestRef.current = null
    ocrRequestRef.current = null
    setFile(null); setBusy(false); setOcrBusy(false); setOcrProgress(''); setMessage(''); setResult(null)
    if (resultUrl.current) { URL.revokeObjectURL(resultUrl.current); resultUrl.current = null }
    return () => { requestRef.current?.abort(); requestRef.current = null; ocrRequestRef.current?.abort(); ocrRequestRef.current = null }
  }, [conversion.slug])
  function chooseFiles(files) {
    const next = files[0]
    if (!next) return
    if (!next.size) { setMessage('This file is empty. Choose another document.'); return }
    if (!next.name.toLowerCase().endsWith(`.${conversion.extension}`)) {
      setMessage(`Choose a .${conversion.extension} file for ${conversion.label}.`)
      return
    }
    if (next.size > 25 * 1024 * 1024) { setMessage('Choose a document smaller than 25 MB.'); return }
    setFile(next); setMessage(''); setResult(null)
    if (resultUrl.current) { URL.revokeObjectURL(resultUrl.current); resultUrl.current = null }
  }
  async function convert() {
    if (!file || busy || ocrBusy) return
    setBusy(true); setMessage('')
    const request = new AbortController()
    requestRef.current = request
    try {
      const data = new FormData(); data.append('file', file)
      const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
      const response = await fetch(`${apiBase}/api/v1/conversions/${conversion.slug}`, { method: 'POST', body: data, signal: request.signal })
      if (!response.ok) {
        const problem = await response.json().catch(() => null)
        const detail = problem?.message || problem?.error
        const fallback = response.status === 403
          ? 'The API blocked this request. Refresh the page and try again; if it continues, check the server access settings.'
          : response.status === 413
            ? 'This file is too large for the conversion service. Choose a smaller file.'
            : response.status >= 500
              ? 'The conversion service encountered a server error. Try again in a moment.'
              : `Conversion failed (${response.status}). Check that the file matches the selected format.`
        throw new Error(detail || fallback)
      }
      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition') || ''
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
      const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1]
      const outputName = encodedName ? decodeURIComponent(encodedName) : plainName || `converted.${conversion.to === 'PDF' ? 'pdf' : conversion.to === 'Word' ? 'docx' : 'pptx'}`
      resultUrl.current = URL.createObjectURL(blob)
      setResult({ url: resultUrl.current, name: outputName, size: blob.size })
      setMessage('Your converted document is ready.')
    } catch (error) {
      if (!request.signal.aborted) setMessage(error?.message || 'We could not convert this document. Check the file and try again.')
    } finally {
      if (requestRef.current === request) {
        requestRef.current = null
        setBusy(false)
      }
    }
  }
  async function runOcr() {
    if (!file || conversion.slug !== 'pdf-to-word' || busy || ocrBusy) return
    const request = new AbortController()
    ocrRequestRef.current = request
    setOcrBusy(true); setOcrProgress('Preparing OCR…'); setMessage(''); setResult(null)
    if (resultUrl.current) { URL.revokeObjectURL(resultUrl.current); resultUrl.current = null }
    try {
      const { convertScannedPdfToWord } = await import('../lib/ocrPdfToWord.js')
      const { blob, pageCount } = await convertScannedPdfToWord(file, ocrLanguage, setOcrProgress, request.signal)
      if (request.signal.aborted) return
      const stem = file.name.replace(/\.pdf$/i, '')
      const outputName = `${stem}-ocr.docx`
      resultUrl.current = URL.createObjectURL(blob)
      setResult({ url: resultUrl.current, name: outputName, size: blob.size })
      setMessage(`OCR found editable text on ${pageCount} page${pageCount === 1 ? '' : 's'}. The PDF stayed in your browser.`)
    } catch (error) {
      if (!request.signal.aborted) setMessage(error?.message || 'OCR could not process this PDF. Try a clearer scan or another language.')
    } finally {
      if (ocrRequestRef.current === request) {
        ocrRequestRef.current = null
        setOcrBusy(false); setOcrProgress('')
      }
    }
  }
  return <div className="workspace-card document-workspace">
    <div className="workspace-heading"><div><span className="workspace-kicker"><FileText size={15} /> Document converter</span><h2>Convert your document</h2><p>Choose a direction, add a file and download the converted copy.</p></div><span className="workspace-privacy"><ShieldCheck size={15} /> Temporary processing</span></div>
    <div className="conversion-selector"><label className="field-label">Convert<select disabled={busy || ocrBusy} value={conversion.slug} onChange={(event) => navigate(`/${event.target.value}`)}>{conversions.map((item) => <option value={item.slug} key={item.slug}>{item.label}</option>)}</select></label><div className="conversion-arrow"><span>{conversion.from}</span><span className="conversion-arrow-icon">→</span><span>{conversion.to}</span></div><p>{conversion.detail}</p></div>
    {!file ? <DropZone accept={conversion.accept} multiple={false} disabled={busy || ocrBusy} onFiles={chooseFiles} title={`Drop a .${conversion.extension} file here`} /> : <div className="conversion-file-card"><span className="conversion-file-icon"><FileText size={23} /></span><div className="conversion-file-meta"><strong>{file.name}</strong><small>{formatBytes(file.size)} · {conversion.from}</small></div><button className="icon-button remove-mini" disabled={busy || ocrBusy} onClick={() => { setFile(null); setResult(null); setMessage('') }} aria-label="Remove selected document"><X size={16} /></button><button className="button-primary convert-button" disabled={busy || ocrBusy} onClick={convert}>{busy ? <><LoaderCircle size={17} className="spin" /> Converting…</> : <>Convert to {conversion.to} <ArrowDown size={17} /></>}</button></div>}
    {conversion.slug === 'pdf-to-word' && file && <div className="ocr-panel"><div className="ocr-copy"><strong>Scanned PDF? Run OCR in your browser.</strong><p>Recognizes text from page images and creates an editable Word file. The PDF stays on this device; OCR models download from a public CDN and can be cached for later use.</p></div><div className="ocr-controls"><label className="field-label">OCR language<select value={ocrLanguage} disabled={busy || ocrBusy} onChange={(event) => setOcrLanguage(event.target.value)}><option value="eng">English</option><option value="hin">Hindi</option><option value="eng+hin">English + Hindi</option></select></label><button className="button-primary" disabled={busy || ocrBusy} onClick={runOcr}>{ocrBusy ? <><LoaderCircle size={16} className="spin" /> {ocrProgress || 'Reading pages…'}</> : <>Create OCR Word file <ArrowDown size={16} /></>}</button></div></div>}
    <div className="conversion-note"><span className="note-mark">i</span><p><strong>{['pdf-to-word', 'ppt-to-word', 'word-to-ppt'].includes(conversion.slug) ? 'Pages and slides keep the uploaded file’s appearance without an extra text copy.' : 'Word-to-PDF keeps the document content and page layout.'}</strong> Word and PowerPoint page conversions use page images, so text in those images is not directly editable. Use browser OCR when you need editable text from a PDF. Word and PowerPoint conversions need LibreOffice in the API environment.</p></div>
    {message && <div className={`status-message ${result ? 'is-success' : ''}`} role="status">{result ? <Check size={16} /> : <RefreshCw size={15} />}{message}{result && <a className="inline-download" href={result.url} download={result.name}><Download size={15} /> Download {result.name} · {formatBytes(result.size)}</a>}</div>}
    <div className="workspace-footnote"><ShieldCheck size={14} /> {conversion.slug === 'pdf-to-word' ? 'Standard conversion uploads temporarily; the OCR option processes the PDF in your browser.' : 'Files are processed temporarily and removed after conversion.'}</div>
  </div>
}

function PercentageCalculator() {
  const [mode, setMode] = useState('percentage')
  const [rate, setRate] = useState('15')
  const [amount, setAmount] = useState('2400')
  const numberRate = Number(rate); const numberAmount = Number(amount)
  const maxRate = mode === 'discount' ? 100 : 1000
  const valid = rate.trim() !== '' && amount.trim() !== ''
    && Number.isFinite(numberRate) && Number.isFinite(numberAmount)
    && numberRate >= 0 && numberRate <= maxRate
    && numberAmount >= 0 && numberAmount <= 1_000_000_000_000
  let result = 0; let secondary = ''; let title = ''
  if (valid && mode === 'percentage') { result = numberAmount * numberRate / 100; title = `${numberRate}% of ${formatCurrency(numberAmount)}`; secondary = `${numberRate} ÷ 100 × ${formatCurrency(numberAmount)}` }
  if (valid && mode === 'discount') { result = numberAmount * (1 - numberRate / 100); title = 'You pay after discount'; secondary = `You save ${formatCurrency(numberAmount * numberRate / 100)}` }
  if (valid && mode === 'gst') { result = numberAmount * (1 + numberRate / 100); title = 'Total including GST'; secondary = `GST amount: ${formatCurrency(numberAmount * numberRate / 100)}` }
  return <div className="workspace-card calculator-workspace">
    <div className="workspace-heading"><div><span className="workspace-kicker"><SlidersHorizontal size={15} /> Percentage calculator</span><h2>Get to your number</h2><p>Choose a calculation and see a clear result.</p></div><span className="workspace-privacy"><ShieldCheck size={15} /> Calculated in browser</span></div>
    <div className="calculator-tabs" role="tablist" aria-label="Calculation type">{[['percentage', 'Percentage'], ['discount', 'Discount'], ['gst', 'GST']].map(([value, label]) => <button role="tab" aria-selected={mode === value} className={mode === value ? 'is-active' : ''} key={value} onClick={() => setMode(value)}>{label}</button>)}</div>
    <div className="calculator-layout"><div className="calculator-fields"><label className="field-label">{mode === 'discount' ? 'Discount' : mode === 'gst' ? 'GST rate' : 'Percentage'} (%)<div className="input-with-suffix"><input type="number" min="0" max={mode === 'discount' ? '100' : '1000'} step="0.1" value={rate} onChange={(event) => setRate(event.target.value)} /><span>%</span></div></label><label className="field-label">{mode === 'discount' ? 'Original price' : mode === 'gst' ? 'Amount before GST' : 'What number?'}<div className="input-with-prefix"><span>₹</span><input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></label><div className="formula-note"><span>Quick tip</span><p>{mode === 'percentage' ? 'Percentage × amount ÷ 100 gives your answer.' : mode === 'discount' ? 'See how much you save and what remains to pay.' : 'Add GST to the pre-tax amount for your total.'}</p></div></div><div className="calculation-result"><span className="result-label">{title || 'Your result'}</span><strong>{valid ? formatCurrency(result) : '—'}</strong><span className="result-secondary">{secondary || (mode === 'discount' ? 'Enter a discount rate from 0% to 100%.' : 'Enter valid numbers to calculate.')}</span><div className="result-decoration">%</div></div></div>
    <div className="workspace-footnote"><ShieldCheck size={14} /> Your numbers are not stored or sent anywhere.</div>
  </div>
}

function EmiCalculator() {
  const [principal, setPrincipal] = useState('2500000')
  const [rate, setRate] = useState('8.5')
  const [years, setYears] = useState('20')
  const p = Number(principal); const annual = Number(rate); const tenure = Number(years)
  const months = Math.round(tenure * 12); const monthlyRate = annual / 1200
  const inputsValid = principal.trim() !== '' && rate.trim() !== '' && years.trim() !== ''
    && Number.isFinite(p) && p >= 10000 && p <= 100000000
    && Number.isFinite(annual) && annual >= 0 && annual <= 40
    && Number.isFinite(tenure) && tenure >= 1 && tenure <= 40
  const emi = inputsValid && months > 0
    ? monthlyRate === 0 ? p / months : p * monthlyRate * ((1 + monthlyRate) ** months) / (((1 + monthlyRate) ** months) - 1)
    : 0
  const valid = inputsValid && Number.isFinite(emi) && emi > 0
  const total = valid ? emi * months : 0; const interest = valid ? Math.max(0, total - p) : 0
  return <div className="workspace-card calculator-workspace emi-workspace">
    <div className="workspace-heading"><div><span className="workspace-kicker"><SlidersHorizontal size={15} /> EMI calculator</span><h2>Plan your monthly payment</h2><p>Adjust the loan details to compare an estimated EMI.</p></div><span className="workspace-privacy"><ShieldCheck size={15} /> Calculated in browser</span></div>
    <div className="emi-layout"><div className="emi-controls">
      <EmiField label="Loan amount" value={principal} setValue={setPrincipal} min="10000" max="100000000" step="10000" prefix="₹" rangeMin="50000" rangeMax="20000000" rangeStep="25000" />
      <EmiField label="Interest rate per year" value={rate} setValue={setRate} min="0" max="40" step="0.1" suffix="%" rangeMin="1" rangeMax="24" rangeStep="0.1" />
      <EmiField label="Loan term" value={years} setValue={setYears} min="1" max="40" step="1" suffix="years" rangeMin="1" rangeMax="30" rangeStep="1" />
    </div><div className="emi-result-panel"><span className="result-label">Estimated monthly EMI</span><strong>{valid ? formatCurrency(emi) : '—'}</strong><span className="emi-per-month">per month · {months} instalments</span><div className="emi-breakdown"><div><span>Principal</span><b>{formatCurrency(p || 0)}</b></div><div><span>Total interest</span><b>{formatCurrency(interest)}</b></div><div><span>Total repayment</span><b>{formatCurrency(total)}</b></div></div></div></div>
    <p className="calculator-disclaimer">Estimate only. Lender fees, rate changes and repayment terms can change the actual amount.</p>
    <div className="workspace-footnote"><ShieldCheck size={14} /> Your loan details stay in this page.</div>
  </div>
}

function EmiField({ label, value, setValue, min, max, step, prefix, suffix, rangeMin, rangeMax, rangeStep }) {
  return <label className="emi-field field-label"><span>{label}</span><div className="emi-input-row">{prefix && <span className="input-prefix">{prefix}</span>}<input type="number" value={value} min={min} max={max} step={step} onChange={(event) => setValue(event.target.value)} /><span className="emi-unit">{suffix || ''}</span></div><input className="emi-range" type="range" min={rangeMin} max={rangeMax} step={rangeStep} value={Math.max(rangeMin, Math.min(rangeMax, Number(value) || rangeMin))} onChange={(event) => setValue(event.target.value)} /></label>
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0)
}

export default ToolWorkspace;
