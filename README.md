# KraantiTools

KraantiTools is a privacy-conscious home for everyday image, PDF, document, career and calculator tools. Image processing, PDF utilities, career document building and calculations run in the browser. Four office document conversions use a Spring Boot API and temporary files that are removed after each request.

## Included tools

- Image compressor with quality, output format, target size and resize controls
- JPG, PNG and WebP converter
- PDF merger with file order controls
- PDF page extraction by page numbers and ranges
- Image-to-PDF with A4 or image-sized pages and ordering controls
- PDF optimization that preserves selectable text/vectors, plus optional visual compression for smaller scanned files (visual mode rasterizes pages)
- PDF to Word with appearance-preserving page images and optional in-browser English/Hindi OCR for editable text; Word to PDF
- PowerPoint to Word and Word to PowerPoint with appearance-preserving slide/page images
- Resume builder with four single-column styles (Professional, Modern, Executive and Minimal), plus an editable cover letter builder; both support Word download and browser print-to-PDF
- Percentage, discount, GST and EMI calculators
- Dedicated, shareable tool pages, touch-friendly mobile controls, responsive navigation and metadata
- Installable web app on supported mobile and desktop browsers, with a cached app shell
- Docker setup for the React site, Spring Boot API and LibreOffice conversion engine

## Run the project

### Requirements

- Node.js 22.13+ or 24 (required by the installed PDF renderer)
- Docker Desktop with Compose for the one-command app, or Java 21+ and Maven 3.6.3+ for the API

### Start the complete app with Docker

From the project root:

```powershell
docker compose up --build
```

Open `http://localhost:5173`. The API is available at `http://localhost:8080`. The API accepts document uploads up to 25 MB. It keeps no account or file database; each conversion uses a temporary workspace that is deleted when processing finishes. This is the simplest local run path because the backend image includes LibreOffice for Word-to-PDF conversion.

To use the app from a phone or tablet on the same Wi-Fi, find the computer's IPv4 address with `ipconfig` and open `http://<computer-ip>:5173` on the mobile browser. For example, use `http://192.168.1.20:5173` when that is the computer's displayed IPv4 address. The web container proxies API requests to the backend, whose host port stays bound to the computer. If Windows Firewall asks, allow the web app on the private network.

On supported browsers, use the browser's Install app or Add to Home Screen command. Installation and offline app-shell caching require HTTPS on a deployed site; browsers also treat `localhost` as secure. Offline mode can open cached app files, but API conversions still need the computer or server online. On iPhone or iPad, use Safari's Share menu and choose **Add to Home Screen**.

If Java 21 and Maven are already installed, run the API directly with `cd backend` followed by `mvn spring-boot:run`. Word and PowerPoint page rendering requires LibreOffice; the Docker image includes it.

To build canonical links and a sitemap for a chosen production domain, set `SITE_URL` before building, for example `$env:SITE_URL = 'https://your-domain.example'` in PowerShell. The same value drives canonical URLs during client-side navigation.

### Run the frontend in development mode

First start the API in one terminal with `docker compose up --build backend`. Then start the Vite server in a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The development server listens on the local network and proxies `/api` requests to the backend, so a phone on the same Wi-Fi can use `http://<computer-ip>:5173`. To use a separately hosted API, set `VITE_API_BASE_URL` in `frontend/.env.local` and add its site origin to `APP_CORS_ALLOWED_ORIGINS`.

### Build the frontend

```powershell
cd frontend
npm run build
```

The output is written to `frontend/dist`. The root `vercel.json` configures the Vercel build and output directories.

The build creates individual HTML entry points and structured metadata for the home page, each tool and each document conversion route. Set `SITE_URL` to the final HTTPS site origin during the build to also generate canonical links and `sitemap.xml`; this keeps the not-yet-selected production domain out of the source. Set `VITE_API_BASE_URL` to the public API origin for a split frontend/backend deployment, and allow that origin in `APP_CORS_ALLOWED_ORIGINS`.

## API

| Method | Endpoint | Input | Output |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | — | API health |
| POST | `/api/v1/conversions/pdf-to-word` | multipart field `file` (`.pdf`) | `.docx` |
| POST | `/api/v1/conversions/word-to-pdf` | multipart field `file` (`.docx`) | `.pdf` |
| POST | `/api/v1/conversions/ppt-to-word` | multipart field `file` (`.pptx`) | `.docx` |
| POST | `/api/v1/conversions/word-to-ppt` | multipart field `file` (`.docx`) | `.pptx` |

PDF-to-Word and PowerPoint-to-Word preserve each source page or slide as a high-resolution image, without appending duplicate text. Word-to-PowerPoint preserves each rendered Word page as a slide image. These page images are not directly editable as text. Word-to-PDF uses LibreOffice to preserve document content and layout. PDF-to-Word also offers browser OCR for editable text; the PDF stays on the device while the OCR worker and selected language model are downloaded from public CDNs on first use and cached by the browser. Word and PowerPoint page rendering requires LibreOffice; the Docker image includes it. Visual PDF compression rasterizes pages; choose the content-preserving optimization option when selectable text and vectors matter more than size reduction.

## Privacy and data handling

- Image compression, image conversion, PDF merge/split/optimization/compression, image-to-PDF, OCR, resume/cover-letter builders and calculators run in the browser. OCR downloads its worker and language model from public CDNs but does not upload the PDF.
- Calculators do not send values to the API.
- Document conversions upload the selected file to the API for processing. The server writes it to a per-request temporary directory and removes that directory after returning the result.
- The API has no database, sign-in, file archive or analytics integration in this MVP.

## Project layout

```text
frontend/   React + Vite UI, browser tools and SEO pages
backend/    Spring Boot REST API and document conversion services
docker-compose.yml
```
