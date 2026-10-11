import { useState } from 'react'
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { Briefcase, Download, FileText, LoaderCircle, Plus, Printer, ShieldCheck, Trash2 } from 'lucide-react'

const resumeSeed = {
  name: 'Your name', headline: 'Professional title', email: 'you@example.com', phone: '+91 00000 00000', location: 'City, Country', website: 'linkedin.com/in/yourname',
  summary: 'Write a short introduction focused on your strengths, years of experience and the value you bring to your next role.',
  skills: 'Project management, Communication, Data analysis, Problem solving',
  experience: [{ role: 'Job title', company: 'Company name', dates: '2023 – Present', location: 'City', details: 'Describe an outcome you delivered, using a clear action and a measurable result where possible.\nAdd another accomplishment relevant to your target role.' }],
  education: [{ degree: 'Degree or qualification', school: 'Institution name', dates: '2019 – 2023', details: 'Optional grade, coursework or distinction' }],
}

const resumeTemplates = [
  { id: 'professional', name: 'Professional', description: 'Balanced and ATS-friendly', primary: '243D30', accent: '557140', muted: '71885C', font: 'Arial', alignment: AlignmentType.CENTER, margins: { top: 850, bottom: 850, left: 900, right: 900 } },
  { id: 'modern', name: 'Modern', description: 'Clean lines with a cool accent', primary: '20364A', accent: '267D83', muted: '64808B', font: 'Arial', alignment: AlignmentType.LEFT, margins: { top: 900, bottom: 900, left: 950, right: 950 } },
  { id: 'executive', name: 'Executive', description: 'Refined typography and warm detail', primary: '302E2A', accent: 'A2763F', muted: '8B795F', font: 'Georgia', alignment: AlignmentType.CENTER, margins: { top: 1050, bottom: 1000, left: 1050, right: 1050 } },
  { id: 'minimal', name: 'Minimal', description: 'Compact, simple and easy to scan', primary: '273444', accent: '526579', muted: '718092', font: 'Arial', alignment: AlignmentType.LEFT, compact: true, margins: { top: 650, bottom: 650, left: 850, right: 850 } },
]

const letterSeed = {
  name: 'Your name', email: 'you@example.com', phone: '+91 00000 00000', location: 'City, Country', date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
  recipient: 'Hiring Manager', company: 'Company name', job: 'Job title',
  opening: 'I am applying for the [Job Title] role at [Company]. The opportunity is a strong match for my experience in [relevant area] and my interest in [specific reason for the role].',
  evidence: 'In my recent work, I [describe a relevant accomplishment and its impact]. This experience has helped me build strong skills in [skill one] and [skill two], which I would bring to your team.',
  closing: 'I would welcome the opportunity to discuss how my experience could support your team. Thank you for your time and consideration.',
  signoff: 'Sincerely,',
}

function Field({ label, value, onChange, multiline = false, placeholder }) {
  const Control = multiline ? 'textarea' : 'input'
  return <label className="field-label career-field">{label}<Control value={value} placeholder={placeholder} rows={multiline ? 4 : undefined} onChange={(event) => onChange(event.target.value)} /></label>
}

function useWordDownload() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function download(document, fileName) {
    setBusy(true); setMessage('')
    try {
      const blob = await Packer.toBlob(document)
      const url = URL.createObjectURL(blob)
      const anchor = window.document.createElement('a')
      anchor.href = url; anchor.download = fileName; anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage(`${fileName} is ready.`)
    } catch (error) {
      setMessage(error?.message || 'The Word document could not be created.')
    } finally { setBusy(false) }
  }
  return { busy, message, download }
}

function wordParagraph(text, options = {}) {
  return new Paragraph({ children: [new TextRun({ text: text || ' ', font: 'Arial', size: 20, color: '33483A', ...options })], spacing: { after: 110 } })
}

function wordSection(title, template = resumeTemplates[0]) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, border: { bottom: { color: template.accent, space: 6, style: 'single', size: template.compact ? 2 : 4 } }, spacing: { before: template.compact ? 180 : 260, after: 120 }, children: [new TextRun({ text: title.toUpperCase(), font: template.font, bold: true, size: 21, color: template.accent })] })
}

function nonemptyLines(text) { return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean) }
function filename(value, fallback) { return (value || fallback).trim().replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 48) || fallback }

export function ResumeBuilder() {
  const [resume, setResume] = useState(resumeSeed)
  const [templateId, setTemplateId] = useState('professional')
  const { busy, message, download } = useWordDownload()
  const template = resumeTemplates.find((item) => item.id === templateId) || resumeTemplates[0]
  function update(field, value) { setResume((current) => ({ ...current, [field]: value })) }
  function updateRow(section, index, field, value) { setResume((current) => ({ ...current, [section]: current[section].map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row) })) }
  function addRow(section) { setResume((current) => ({ ...current, [section]: [...current[section], section === 'experience' ? { role: '', company: '', dates: '', location: '', details: '' } : { degree: '', school: '', dates: '', details: '' }] })) }
  function removeRow(section, index) { setResume((current) => ({ ...current, [section]: current[section].filter((_, rowIndex) => rowIndex !== index) })) }
  function createDoc() {
    const contact = [resume.email, resume.phone, resume.location, resume.website].filter(Boolean).join('  |  ')
    const children = [
      new Paragraph({ alignment: template.alignment, spacing: { after: 65 }, border: template.alignment === AlignmentType.LEFT ? { bottom: { color: template.accent, space: 8, style: 'single', size: template.compact ? 2 : 8 } } : undefined, children: [new TextRun({ text: resume.name || 'Your name', font: template.font, bold: true, size: template.compact ? 32 : 36, color: template.primary })] }),
      new Paragraph({ alignment: template.alignment, spacing: { after: 100 }, children: [new TextRun({ text: resume.headline || 'Professional title', font: template.font, size: 23, color: template.muted })] }),
      new Paragraph({ alignment: template.alignment, spacing: { after: 190 }, children: [new TextRun({ text: contact || 'Add your contact information', font: template.font, size: 18, color: '5F6C62' })] }),
    ]
    if (resume.summary.trim()) children.push(wordSection('Professional summary', template), wordParagraph(resume.summary.trim(), { font: template.font }))
    const skills = resume.skills.split(',').map((skill) => skill.trim()).filter(Boolean)
    if (skills.length) children.push(wordSection('Skills', template), wordParagraph(skills.join('  ·  '), { font: template.font }))
    if (resume.experience.length) {
      children.push(wordSection('Experience', template))
      resume.experience.forEach((item) => {
        if ([item.role, item.company, item.dates, item.details].some((value) => value.trim())) {
          children.push(new Paragraph({ keepNext: true, spacing: { before: template.compact ? 65 : 100, after: 35 }, children: [new TextRun({ text: item.role || 'Role', font: template.font, bold: true, size: 21, color: template.primary }), new TextRun({ text: item.dates ? `  |  ${item.dates}` : '', font: template.font, size: 18, color: '738071' })] }))
          if (item.company || item.location) children.push(wordParagraph([item.company, item.location].filter(Boolean).join(' · '), { font: template.font, color: '647365', size: 18 }))
          nonemptyLines(item.details).forEach((line) => children.push(new Paragraph({ bullet: { indent: 300 }, spacing: { after: 55 }, children: [new TextRun({ text: line, font: template.font, size: 19, color: template.primary })] })))
        }
      })
    }
    if (resume.education.length) {
      children.push(wordSection('Education', template))
      resume.education.forEach((item) => {
        if ([item.degree, item.school, item.dates, item.details].some((value) => value.trim())) {
          children.push(new Paragraph({ keepNext: true, spacing: { before: template.compact ? 55 : 90, after: 35 }, children: [new TextRun({ text: item.degree || 'Qualification', font: template.font, bold: true, size: 20, color: template.primary }), new TextRun({ text: item.dates ? `  |  ${item.dates}` : '', font: template.font, size: 18, color: '738071' })] }))
          if (item.school || item.details) children.push(wordParagraph([item.school, item.details].filter(Boolean).join(' · '), { font: template.font, color: '647365', size: 18 }))
        }
      })
    }
    return new Document({ creator: 'KraantiTools', title: `${resume.name || 'Resume'} — ${template.name} Resume`, sections: [{ properties: { page: { margin: template.margins } }, children }] })
  }
  return <div className="workspace-card career-workspace">
    <div className="workspace-heading"><div><span className="workspace-kicker"><Briefcase size={15} /> Resume builder</span><h2>Build your resume your way</h2><p>Choose a design, fill in your details and preview the result before downloading.</p></div><span className="workspace-privacy"><ShieldCheck size={15} /> Stays in browser</span></div>
    <section className="resume-template-picker" aria-label="Choose a resume design"><div className="resume-template-heading"><strong>Choose a template</strong><span>{template.name} selected</span></div><div className="resume-template-grid">{resumeTemplates.map((option) => <button key={option.id} type="button" className={`resume-template-option ${templateId === option.id ? 'is-selected' : ''}`} aria-pressed={templateId === option.id} onClick={() => setTemplateId(option.id)}><span className={`resume-template-sample resume-template-sample-${option.id}`} aria-hidden="true"><i /><b /><em /><small /><small /><small /></span><span className="resume-template-option-copy"><strong>{option.name}</strong><small>{option.description}</small></span><span className="resume-template-check" aria-hidden="true">{templateId === option.id ? '✓' : ''}</span></button>)}</div></section>
    <div className="career-layout"><div className="career-editor">
      <div className="career-form-section"><strong>Contact and profile</strong><div className="career-form-grid"><Field label="Full name" value={resume.name} onChange={(value) => update('name', value)} /><Field label="Professional title" value={resume.headline} onChange={(value) => update('headline', value)} /><Field label="Email" value={resume.email} onChange={(value) => update('email', value)} /><Field label="Phone" value={resume.phone} onChange={(value) => update('phone', value)} /><Field label="Location" value={resume.location} onChange={(value) => update('location', value)} /><Field label="LinkedIn or portfolio" value={resume.website} onChange={(value) => update('website', value)} /></div><Field label="Professional summary" multiline value={resume.summary} onChange={(value) => update('summary', value)} /><Field label="Skills · separated by commas" multiline value={resume.skills} onChange={(value) => update('skills', value)} /></div>
      <div className="career-form-section"><div className="career-section-title"><strong>Experience</strong><button className="text-button" onClick={() => addRow('experience')}><Plus size={14} /> Add role</button></div>{resume.experience.map((item, index) => <div className="career-entry" key={`experience-${index}`}><div className="career-form-grid"><Field label="Role" value={item.role} onChange={(value) => updateRow('experience', index, 'role', value)} /><Field label="Company" value={item.company} onChange={(value) => updateRow('experience', index, 'company', value)} /><Field label="Dates" value={item.dates} onChange={(value) => updateRow('experience', index, 'dates', value)} /><Field label="Location" value={item.location} onChange={(value) => updateRow('experience', index, 'location', value)} /></div><Field label="Achievements · one per line" multiline value={item.details} onChange={(value) => updateRow('experience', index, 'details', value)} />{resume.experience.length > 1 && <button className="text-button career-remove" onClick={() => removeRow('experience', index)}><Trash2 size={13} /> Remove role</button>}</div>)}</div>
      <div className="career-form-section"><div className="career-section-title"><strong>Education</strong><button className="text-button" onClick={() => addRow('education')}><Plus size={14} /> Add education</button></div>{resume.education.map((item, index) => <div className="career-entry" key={`education-${index}`}><div className="career-form-grid"><Field label="Qualification" value={item.degree} onChange={(value) => updateRow('education', index, 'degree', value)} /><Field label="School or institution" value={item.school} onChange={(value) => updateRow('education', index, 'school', value)} /><Field label="Dates" value={item.dates} onChange={(value) => updateRow('education', index, 'dates', value)} /></div><Field label="Optional details" value={item.details} onChange={(value) => updateRow('education', index, 'details', value)} />{resume.education.length > 1 && <button className="text-button career-remove" onClick={() => removeRow('education', index)}><Trash2 size={13} /> Remove education</button>}</div>)}</div>
    </div><ResumePreview resume={resume} template={template} />
    </div>
    <div className="career-actions"><span className="career-note"><ShieldCheck size={14} /> No account needed. Download your Word copy or save a PDF from print.</span><div className="career-buttons"><button className="button-secondary" onClick={() => window.print()}><Printer size={16} /> Print / save PDF</button><button className="button-primary" disabled={busy} onClick={() => download(createDoc(), `${filename(resume.name, 'resume')}-resume.docx`)}>{busy ? <><LoaderCircle size={16} className="spin" /> Preparing…</> : <><Download size={16} /> Download Word</>}</button></div></div>
    {message && <div className={`status-message ${message.endsWith('ready.') ? 'is-success' : ''}`} role="status">{message}</div>}
  </div>
}

function ResumePreview({ resume, template }) {
  const skills = resume.skills.split(',').map((skill) => skill.trim()).filter(Boolean)
  return <div className="career-preview-wrap"><div className="preview-title"><FileText size={14} /> Live preview · {template.name}</div><article className={`resume-paper print-document resume-template-${template.id}`}><header><h2>{resume.name || 'Your name'}</h2><p className="resume-headline">{resume.headline || 'Professional title'}</p><p className="resume-contact">{[resume.email, resume.phone, resume.location, resume.website].filter(Boolean).join(' · ')}</p></header>{resume.summary.trim() && <section><h3>Professional summary</h3><p>{resume.summary}</p></section>}{skills.length > 0 && <section><h3>Skills</h3><p>{skills.join(' · ')}</p></section>}{resume.experience.some((item) => [item.role, item.company, item.details].some((value) => value.trim())) && <section><h3>Experience</h3>{resume.experience.map((item, index) => <div className="resume-entry" key={index}><div className="resume-entry-heading"><strong>{item.role || 'Role'}</strong><span>{item.dates}</span></div><p className="resume-entry-meta">{[item.company, item.location].filter(Boolean).join(' · ')}</p>{nonemptyLines(item.details).length > 0 && <ul>{nonemptyLines(item.details).map((line, lineIndex) => <li key={lineIndex}>{line}</li>)}</ul>}</div>)}</section>}{resume.education.some((item) => [item.degree, item.school, item.details].some((value) => value.trim())) && <section><h3>Education</h3>{resume.education.map((item, index) => <div className="resume-entry" key={index}><div className="resume-entry-heading"><strong>{item.degree || 'Qualification'}</strong><span>{item.dates}</span></div><p className="resume-entry-meta">{[item.school, item.details].filter(Boolean).join(' · ')}</p></div>)}</section>}</article></div>
}

export function CoverLetterBuilder() {
  const [letter, setLetter] = useState(letterSeed)
  const { busy, message, download } = useWordDownload()
  function update(field, value) { setLetter((current) => ({ ...current, [field]: value })) }
  function createDoc() {
    const contact = [letter.email, letter.phone, letter.location].filter(Boolean).join('  |  ')
    const children = [
      wordParagraph(letter.name || 'Your name', { bold: true, size: 28, color: '243D30' }),
      wordParagraph(contact, { size: 18, color: '647365' }),
      ...(letter.location ? [wordParagraph(letter.location, { size: 18, color: '647365' })] : []),
      wordParagraph(letter.date, { size: 18, color: '647365' }),
      ...[letter.recipient, letter.company].filter(Boolean).map((line) => wordParagraph(line, { size: 20 })),
      wordParagraph(`Re: ${letter.job || 'Application'}`, { bold: true, size: 20, color: '557140' }),
      wordParagraph(`Dear ${letter.recipient || 'Hiring Manager'},`),
      ...[letter.opening, letter.evidence, letter.closing].filter((paragraph) => paragraph.trim()).map((paragraph) => wordParagraph(paragraph.trim())),
      wordParagraph(letter.signoff || 'Sincerely,'),
      wordParagraph(letter.name || 'Your name', { bold: true }),
    ]
    return new Document({ creator: 'KraantiTools', title: `${letter.name || 'Cover letter'} — Cover letter`, sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1050, right: 1050 } } }, children }] })
  }
  return <div className="workspace-card career-workspace">
    <div className="workspace-heading"><div><span className="workspace-kicker"><Briefcase size={15} /> Cover letter builder</span><h2>Make it specific to the role</h2><p>Personalize the guided letter and review it before you download.</p></div><span className="workspace-privacy"><ShieldCheck size={15} /> Stays in browser</span></div>
    <div className="career-layout"><div className="career-editor">
      <div className="career-form-section"><strong>Your contact details</strong><div className="career-form-grid"><Field label="Full name" value={letter.name} onChange={(value) => update('name', value)} /><Field label="Email" value={letter.email} onChange={(value) => update('email', value)} /><Field label="Phone" value={letter.phone} onChange={(value) => update('phone', value)} /><Field label="Location" value={letter.location} onChange={(value) => update('location', value)} /><Field label="Date" value={letter.date} onChange={(value) => update('date', value)} /></div></div>
      <div className="career-form-section"><strong>Role and recipient</strong><div className="career-form-grid"><Field label="Job title" value={letter.job} onChange={(value) => update('job', value)} /><Field label="Company" value={letter.company} onChange={(value) => update('company', value)} /><Field label="Recipient name or title" value={letter.recipient} onChange={(value) => update('recipient', value)} /></div></div>
      <div className="career-form-section"><strong>Your letter</strong><Field label="Opening · why this role" multiline value={letter.opening} onChange={(value) => update('opening', value)} /><Field label="Relevant experience and evidence" multiline value={letter.evidence} onChange={(value) => update('evidence', value)} /><Field label="Closing paragraph" multiline value={letter.closing} onChange={(value) => update('closing', value)} /><Field label="Sign-off" value={letter.signoff} onChange={(value) => update('signoff', value)} /></div>
    </div><CoverLetterPreview letter={letter} /></div>
    <div className="career-actions"><span className="career-note"><ShieldCheck size={14} /> Template text is editable and stays in your browser.</span><div className="career-buttons"><button className="button-secondary" onClick={() => window.print()}><Printer size={16} /> Print / save PDF</button><button className="button-primary" disabled={busy} onClick={() => download(createDoc(), `${filename(letter.name, 'cover-letter')}-cover-letter.docx`)}>{busy ? <><LoaderCircle size={16} className="spin" /> Preparing…</> : <><Download size={16} /> Download Word</>}</button></div></div>
    {message && <div className={`status-message ${message.endsWith('ready.') ? 'is-success' : ''}`} role="status">{message}</div>}
  </div>
}

function CoverLetterPreview({ letter }) {
  return <div className="career-preview-wrap"><div className="preview-title"><FileText size={14} /> Live preview · cover letter</div><article className="letter-paper print-document"><header><h2>{letter.name || 'Your name'}</h2><p>{[letter.email, letter.phone, letter.location].filter(Boolean).join(' · ')}</p></header><p className="letter-date">{letter.date}</p><p className="letter-recipient">{letter.recipient}<br />{letter.company}</p><h3>Re: {letter.job || 'Application'}</h3><p>Dear {letter.recipient || 'Hiring Manager'},</p>{[letter.opening, letter.evidence, letter.closing].filter((paragraph) => paragraph.trim()).map((paragraph, index) => <p key={index}>{paragraph}</p>)}<p>{letter.signoff || 'Sincerely,'}<br /><strong>{letter.name || 'Your name'}</strong></p></article></div>
}
