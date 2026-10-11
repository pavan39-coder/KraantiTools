import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import * as pdfjsLib from 'pdfjs-dist'
import { createWorker } from 'tesseract.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

const OCR_ASSET_VERSION = '7.0.0'
const OCR_LANGUAGE_DATA = 'https://tessdata.projectnaptha.com/4.0.0'

export async function convertScannedPdfToWord(file, language, onProgress = () => {}, signal) {
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose a PDF smaller than 25 MB for browser OCR.')
  let pdf
  let worker
  try {
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
    if (pdf.numPages > 30) throw new Error('Browser OCR supports up to 30 pages per PDF. Split a larger document first.')
    if (signal?.aborted) throw new DOMException('OCR cancelled.', 'AbortError')
    const languages = language.split('+')
    worker = await createWorker(languages, 1, {
      workerPath: `https://cdn.jsdelivr.net/npm/tesseract.js@v${OCR_ASSET_VERSION}/dist/worker.min.js`,
      corePath: `https://cdn.jsdelivr.net/npm/tesseract.js-core@v${OCR_ASSET_VERSION}`,
      langPath: OCR_LANGUAGE_DATA,
      logger: (event) => {
        if (signal?.aborted) return
        const percent = Number.isFinite(event.progress) ? ` ${Math.round(event.progress * 100)}%` : ''
        onProgress(event.status === 'recognizing text' ? `Reading page text${percent}…` : `Loading OCR engine · ${event.status || 'starting'}${percent}`)
      },
    })
    if (signal?.aborted) throw new DOMException('OCR cancelled.', 'AbortError')
    const recognizedPages = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      if (signal?.aborted) throw new DOMException('OCR cancelled.', 'AbortError')
      onProgress(`Preparing page ${pageNumber} of ${pdf.numPages}…`)
      const page = await pdf.getPage(pageNumber)
      const baseViewport = page.getViewport({ scale: 1 })
      const scale = Math.min(2, 1800 / Math.max(baseViewport.width, baseViewport.height), Math.sqrt(12_000_000 / (baseViewport.width * baseViewport.height)))
      const viewport = page.getViewport({ scale: Math.max(0.1, scale) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.ceil(viewport.width))
      canvas.height = Math.max(1, Math.ceil(viewport.height))
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new Error('This browser could not prepare a page for OCR.')
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: context, viewport, background: '#fff' }).promise
      const result = await worker.recognize(canvas)
      recognizedPages.push((result.data.text || '').replace(/\r/g, '').trim())
      canvas.width = 0; canvas.height = 0
      page.cleanup()
    }
    if (!recognizedPages.some((text) => text.trim())) throw new Error('No text was recognized. Try a clearer scan or another OCR language.')
    onProgress('Preparing the editable Word file…')
    const children = []
    recognizedPages.forEach((pageText, index) => {
      if (index > 0) children.push(new Paragraph({ pageBreakBefore: true, children: [new TextRun(' ')] }))
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { after: 140 }, children: [new TextRun({ text: `Page ${index + 1}`, font: 'Arial', bold: true, size: 24, color: '557140' })] }))
      const lines = pageText.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
      for (const paragraph of lines) children.push(new Paragraph({ spacing: { after: 150, line: 280 }, children: [new TextRun({ text: paragraph, font: 'Arial', size: 20, color: '33483A' })] }))
    })
    const document = new Document({ creator: 'KraantiTools OCR', title: `${file.name.replace(/\.pdf$/i, '')} — OCR Word document`, sections: [{ properties: { page: { margin: { top: 850, bottom: 850, left: 900, right: 900 } } }, children }] })
    return { blob: await Packer.toBlob(document), pageCount: pdf.numPages }
  } finally {
    await worker?.terminate().catch(() => {})
    await pdf?.destroy().catch(() => {})
  }
}
