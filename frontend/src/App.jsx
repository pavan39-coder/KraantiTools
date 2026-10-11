import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom'
import {
  ArrowRight, ArrowUpRight, Briefcase, Calculator, ChevronDown, FileText, Heart,
  Image as ImageIcon, LayoutGrid, Menu, Search, ShieldCheck, Sparkles, X, Zap,
} from 'lucide-react'
import { conversions, toolGroups, toolPages } from './data/tools.js'

const ToolWorkspace = lazy(() => import('./components/ToolWorkspace.jsx'))
const iconMap = { image: ImageIcon, file: FileText, calculator: Calculator, career: Briefcase }

function IconBadge({ icon = 'image', className = '' }) {
  const Icon = iconMap[icon] || Sparkles
  return <span className={`icon-badge ${className}`}><Icon size={21} strokeWidth={1.8} /></span>
}

function updateMeta(name, content, attribute = 'name') {
  let element = document.head.querySelector(`meta[${attribute}="${name}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, name)
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
}

function updateCanonical(path) {
  const configuredSite = import.meta.env.VITE_SITE_URL
  if (!configuredSite) return
  let element = document.head.querySelector('link[rel="canonical"]')
  if (!element) {
    element = document.createElement('link')
    element.setAttribute('rel', 'canonical')
    document.head.appendChild(element)
  }
  try {
    element.setAttribute('href', new URL(path, `${new URL(configuredSite).origin}/`).href)
  } catch {
    element.remove()
  }
}

function getPage(pathname) {
  const slug = pathname.replace(/^\/+|\/+$/g, '')
  if (!slug) return null
  if (slug === 'privacy-policy') return {
    slug,
    name: 'KraantiTools Privacy Policy',
    shortName: 'Privacy policy',
    category: 'Your files are yours',
    description: 'How KraantiTools handles browser-based tools and temporary document conversion uploads.',
    seoTitle: 'Privacy Policy — KraantiTools',
    seoDescription: 'Learn which KraantiTools tools process files in your browser and how document conversion uploads are handled.',
    faqs: [],
  }
  if (toolPages[slug]) return { ...toolPages[slug], slug }
  const conversion = conversions.find((item) => item.slug === slug)
  if (!conversion) return null
  const base = toolPages['document-converter']
  const titles = {
    'pdf-to-word': 'PDF to Word converter',
    'word-to-pdf': 'Word to PDF converter',
    'ppt-to-word': 'PowerPoint to Word converter',
    'word-to-ppt': 'Word to PowerPoint converter',
  }
  return {
    ...base,
    ...conversion,
    slug,
    name: titles[slug],
    shortName: conversion.label,
    description: conversion.detail,
    seoTitle: `${conversion.label} Converter Online — KraantiTools`,
    seoDescription: `${conversion.detail} Free online document conversion with temporary processing on KraantiTools.`,
    route: `/${slug}`,
  }
}

function SiteLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setMobileOpen(false), [location.pathname])

  return (
    <div className="site-shell">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="KraantiTools home">
          <span className="brand-mark">K</span>
          <span className="brand-type"><strong>KraantiTools</strong><small>by TechKraanti Digital</small></span>
        </Link>
        <nav className={`main-nav ${mobileOpen ? 'is-open' : ''}`} aria-label="Main navigation">
          <Link to="/privacy-policy" onClick={() => setMobileOpen(false)}>Privacy</Link>
        </nav>
        <div className="header-actions">
          <a className="header-cta" href="/#tools" onClick={() => setMobileOpen(false)}>Browse tools <ArrowUpRight size={16} /></a>
          <button className="menu-toggle" aria-label={mobileOpen ? 'Close menu' : 'Open menu'} onClick={() => setMobileOpen((open) => !open)}>
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>
      <main><Outlet /></main>
      <Footer />
    </div>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-main">
        <div className="footer-brand-block">
          <Link to="/" className="brand"><span className="brand-mark">K</span><span className="brand-type"><strong>KraantiTools</strong><small>by TechKraanti Digital</small></span></Link>
          <p>Small digital jobs, handled simply. Free tools that respect your time and your files.</p>
        </div>
        <div className="footer-links">
          <div><strong>Information</strong><Link to="/privacy-policy">Privacy policy</Link></div>
        </div>
      </div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} KraantiTools · TechKraanti Digital</span><span>Built for everyday wins <Heart size={13} fill="currentColor" /></span></div>
    </footer>
  )
}

function HomePage() {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const tools = Object.entries(toolPages).map(([slug, tool]) => ({
    ...tool,
    slug,
    keywords: slug === 'document-converter' ? conversions.map((item) => `${item.label} ${item.keywords}`).join(' ') : '',
  }))
  const conversionTools = conversions.map((item) => ({ ...item, name: item.label, category: 'PDF & documents', group: 'pdf', icon: 'file', route: `/${item.slug}` }))
  const searchTerm = query.trim().toLowerCase()
  const exactConversions = searchTerm ? conversionTools.filter((tool) => tool.name.toLowerCase() === searchTerm || (searchTerm.includes(' to ') && tool.keywords.includes(searchTerm))) : []
  const searchIndex = exactConversions.length ? exactConversions : tools
  const filtered = searchIndex.filter((tool) => {
    const matchesSearch = !searchTerm || `${tool.name} ${tool.category} ${tool.keywords || ''}`.toLowerCase().includes(searchTerm)
    const matchesCategory = activeCategory === 'all' || tool.group === activeCategory
    return matchesSearch && matchesCategory
  })

  useEffect(() => {
    document.title = 'KraantiTools — useful tools, minus the busywork'
    updateMeta('description', 'Compress images, convert documents, manage PDFs, build career documents and calculate in seconds. Free tools, built around your privacy.')
    updateMeta('og:title', document.title, 'property')
    updateMeta('og:description', 'Compress images, convert documents, manage PDFs, build career documents and calculate in seconds. Free tools, built around your privacy.', 'property')
    updateCanonical('/')
  }, [])

  return (
    <>
      <section className="catalog-hero" aria-labelledby="catalog-title">
        <span className="eyebrow"><span className="eyebrow-dot" /> KraantiTools directory</span>
        <h1 id="catalog-title">The tools you need,<br /><em>all in one place.</em></h1>
        <p>Search once or choose a category to find the right tool.</p>
        <div className="catalog-search" role="search">
          <Search size={19} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tools and conversions" aria-label="Search tools and conversions" />
          {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={17} /></button>}
        </div>
      </section>

      <section className="section-block directory-section" id="tools" aria-labelledby="directory-title">
        <div className="directory-heading">
          <div><h2 id="directory-title">All tools</h2><p>Choose a tool to get started.</p></div>
          <span className="tool-count"><LayoutGrid size={16} /> {filtered.length} {filtered.length === 1 ? 'tool' : 'tools'}</span>
        </div>
        <div className="catalog-filters" role="group" aria-label="Filter tools by category">
          <button type="button" className={activeCategory === 'all' ? 'is-active' : ''} aria-pressed={activeCategory === 'all'} onClick={() => setActiveCategory('all')}>All tools</button>
          {toolGroups.map((group) => <button type="button" key={group.id} className={activeCategory === group.id ? 'is-active' : ''} aria-pressed={activeCategory === group.id} onClick={() => setActiveCategory(group.id)}>{group.label}</button>)}
        </div>
        {filtered.length ? <div className="tool-grid">
          {filtered.map((tool, index) => <ToolCard key={tool.slug} tool={tool} index={index} />)}
        </div> : <div className="catalog-empty"><Search size={22} /><strong>No tools found</strong><span>Try another search or choose a different category.</span></div>}
      </section>
    </>
  )
}
function ToolCard({ tool, index = 0 }) {
  return <Link to={tool.route} className={`tool-card card-${tool.icon} reveal-delay-${index % 4}`}>
    <div className="tool-card-head"><IconBadge icon={tool.icon} /><span className="card-arrow"><ArrowUpRight size={19} /></span></div>
    {tool.badge && <span className="tool-badge">{tool.badge}</span>}
    <h3>{tool.name}</h3><p>{tool.description}</p>
    <span className="card-category">{tool.category}<ArrowRight size={14} /></span>
  </Link>
}

function ToolPage() {
  const { slug } = useParams()
  const location = useLocation()
  const tool = useMemo(() => getPage(location.pathname), [location.pathname])

  useEffect(() => {
    if (!tool) {
      document.title = 'Page not found — KraantiTools'
      updateMeta('description', 'The page you are looking for could not be found.')
      return
    }
    document.title = tool.seoTitle
    updateMeta('description', tool.seoDescription)
    updateMeta('og:title', tool.seoTitle, 'property')
    updateMeta('og:description', tool.seoDescription, 'property')
    updateCanonical(tool.route || `/${slug}`)
  }, [tool, slug])

  if (!tool) return <NotFound />
  if (slug === 'privacy-policy') return <PrivacyPolicy />

  const conversion = conversions.find((item) => item.slug === slug)
  return <div className="tool-page">
    <div className="tool-page-top"><div className="breadcrumbs"><Link to="/#tools">Tools</Link><ChevronDown size={13} className="crumb-chevron" /><span>{tool.category}</span><ChevronDown size={13} className="crumb-chevron" /><strong>{tool.shortName || tool.name}</strong></div></div>
    <section className="tool-intro"><div className="tool-intro-copy"><div className="eyebrow"><span className="eyebrow-dot" /> {tool.category} <span className="eyebrow-separator">·</span> Free online tool</div><h1>{tool.name}<span className="title-spark">✳</span></h1><p>{tool.description}</p><div className="tool-inline-trust"><span><ShieldCheck size={15} /> {tool.slug === 'document-converter' || conversion ? 'Temporary processing' : 'Privacy-minded'}</span><span><Zap size={15} /> Ready in moments</span></div></div><div className="tool-intro-mark"><IconBadge icon={tool.icon} /><span className="intro-mark-orbit orbit-small" /><span className="intro-mark-orbit orbit-large" /></div></section>
    <section className="workspace-section"><Suspense fallback={<div className="workspace-card workspace-loading" role="status" aria-live="polite">Preparing your tool…</div>}><ToolWorkspace tool={tool} conversion={conversion} /></Suspense></section>
    {tool.faqs?.length > 0 && <section className="faq-section"><div className="faq-heading"><span className="eyebrow">Good to know</span><h2>Frequently asked<br /><em>questions.</em></h2><p>A few useful answers before you get started.</p></div><div className="faq-list">{tool.faqs.map(([question, answer]) => <details className="faq-item" key={question}><summary>{question}<span><ChevronDown size={18} /></span></summary><p>{answer}</p></details>)}</div></section>}
  </div>
}

function PrivacyPolicy() {
  return <div className="legal-page"><div className="breadcrumbs"><Link to="/">Home</Link><ChevronDown size={13} className="crumb-chevron" /><strong>Privacy policy</strong></div><div className="legal-heading"><span className="eyebrow"><span className="eyebrow-dot" /> Your files are yours</span><h1>A straightforward<br /><em>privacy policy.</em></h1><p>How KraantiTools handles browser-based tools and temporary document conversion uploads.</p></div><div className="legal-content"><p className="legal-updated">Last updated: October 11, 2026</p><h2>What happens to your files?</h2><p><strong>Image processing, PDF merge/split/optimization, image-to-PDF, browser OCR, resume building and cover letter building run in your browser.</strong> These tools do not upload your selected files or form data to the KraantiTools API.</p><p><strong>Standard document conversion uploads the selected file.</strong> PDF to Word, Word to PDF, PowerPoint to Word, and Word to PowerPoint send files to the KraantiTools API for temporary processing. The request workspace is removed when processing finishes; the API does not save files to a database or archive. PDF-to-Word also offers browser OCR, which keeps the PDF on your device.</p><p>Browser OCR downloads its worker and language model from public CDNs the first time you use it. The PDF pages are passed to the OCR worker in your browser, not to those CDN hosts.</p><h2>Calculator inputs</h2><p>Percentage, discount, GST and EMI calculations happen in your browser. The values you enter are not sent to the API or saved by KraantiTools.</p><h2>Accounts, cookies and analytics</h2><p>This site does not have accounts, an application database, advertising, analytics, or app-set cookies. The production hosting provider may process basic technical request information in server logs under its own terms.</p><h2>What you should know</h2><p>Use a secure HTTPS deployment before accepting real documents. Document conversion layout can differ from the original. OCR quality depends on scan quality and language. Visual PDF compression converts page content into images and may affect search, accessibility, links and forms; choose the content-preserving optimization option to keep text selectable.</p><h2>Questions</h2><p>For privacy questions, contact the site operator using the contact channel published on the production website.</p><div className="legal-note"><ShieldCheck size={17} /><span>This page describes the current local-first tools, OCR asset downloads and temporary document conversion flow. Update it if hosting, analytics, advertising, file retention or processing practices change.</span></div></div></div>
}

function NotFound() {
  return <section className="not-found"><span className="eyebrow">That page took a wrong turn</span><h1>We can’t find<br /><em>that tool.</em></h1><p>Try a different tool from the home page.</p><Link to="/" className="button-primary">Back to KraantiTools <ArrowRight size={17} /></Link></section>
}

export default function App() {
  return <Routes><Route element={<SiteLayout />}><Route index element={<HomePage />} /><Route path=":slug" element={<ToolPage />} /><Route path="*" element={<NotFound />} /></Route></Routes>
}
