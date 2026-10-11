import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { conversions, toolPages } from '../src/data/tools.js'

const distDirectory = resolve('dist')
const template = await readFile(resolve(distDirectory, 'index.html'), 'utf8')
const pages = Object.entries(toolPages).map(([slug, tool]) => ({ slug, ...tool }))
for (const conversion of conversions) {
  const base = toolPages['document-converter']
  pages.push({
    ...base,
    ...conversion,
    slug: conversion.slug,
    name: `${conversion.label} converter`,
    seoTitle: `${conversion.label} Converter Online — KraantiTools`,
    seoDescription: `${conversion.detail} Free online document conversion with temporary processing on KraantiTools.`,
    faqs: base.faqs,
  })
}

const normalizeOrigin = (value) => {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    return url.origin
  } catch { return '' }
}
const siteOrigin = normalizeOrigin(process.env.SITE_URL)
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]))

pages.push({
  slug: 'privacy-policy',
  name: 'KraantiTools Privacy Policy',
  seoTitle: 'Privacy Policy — KraantiTools',
  seoDescription: 'Learn how KraantiTools processes files and calculator inputs, what stays in your browser, and how temporary conversions work.',
  description: 'How KraantiTools handles tool inputs and files in this MVP.',
  faqs: [],
})

if (siteOrigin) {
  const homeData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'KraantiTools',
    url: `${siteOrigin}/`,
    description: 'Free image, PDF, document and calculator tools from TechKraanti Digital.',
    publisher: { '@type': 'Organization', name: 'TechKraanti Digital' },
  }
  const homeHtml = template.replace('</head>', `  <link rel="canonical" href="${siteOrigin}/" />\n  <script type="application/ld+json">${JSON.stringify(homeData)}</script>\n  </head>`)
  await writeFile(resolve(distDirectory, 'index.html'), homeHtml)
}

for (const page of pages) {
  const title = page.seoTitle || `${page.name} — KraantiTools`
  const description = page.seoDescription || page.description
  let html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*("\s*\/?>)/, `$1${escapeHtml(description)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*("\s*\/?>)/, `$1${escapeHtml(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*("\s*\/?>)/, `$1${escapeHtml(description)}$2`)

  const canonicalUrl = siteOrigin ? `${siteOrigin}/${page.slug}` : ''
  if (canonicalUrl) {
    html = html.replace('</head>', `  <link rel="canonical" href="${canonicalUrl}" />\n  </head>`)
  }
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: `KraantiTools ${page.name}`,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any',
    isAccessibleForFree: true,
    description,
    ...(canonicalUrl ? { url: canonicalUrl } : {}),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
  }
  const faqData = page.faqs?.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faqs.map(([question, answer]) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  } : null
  const jsonLd = `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>${faqData ? `<script type="application/ld+json">${JSON.stringify(faqData)}</script>` : ''}`
  html = html.replace('</head>', `  ${jsonLd}\n  </head>`)
  const noScript = `<noscript><main><h1>${escapeHtml(page.name)}</h1><p>${escapeHtml(description)}</p><p>Use the KraantiTools workspace to get started. Enable JavaScript to use this free online tool.</p></main></noscript>`
  html = html.replace('<div id="root"></div>', `${noScript}\n    <div id="root"></div>`)

  const pageDirectory = resolve(distDirectory, page.slug)
  await mkdir(pageDirectory, { recursive: true })
  await writeFile(resolve(pageDirectory, 'index.html'), html)
}

if (siteOrigin) {
  const urls = ['/', ...pages.map((page) => `/${page.slug}`)]
  const entries = urls.map((path) => `  <url><loc>${siteOrigin}${path}</loc></url>`).join('\n')
  await writeFile(resolve(distDirectory, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`)
  await writeFile(resolve(distDirectory, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteOrigin}/sitemap.xml\n`)
}
