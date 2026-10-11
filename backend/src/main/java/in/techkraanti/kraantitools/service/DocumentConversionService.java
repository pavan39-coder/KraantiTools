package in.techkraanti.kraantitools.service;

import java.awt.Dimension;
import java.awt.Rectangle;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;

import org.apache.poi.openxml4j.exceptions.InvalidFormatException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFPictureShape;
import org.apache.poi.xslf.usermodel.XSLFTextBox;
import org.apache.poi.xslf.usermodel.XSLFTextParagraph;
import org.apache.poi.xslf.usermodel.XSLFTextRun;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import org.apache.poi.xslf.usermodel.XSLFPictureData;
import org.apache.poi.sl.usermodel.PictureData;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.ParagraphAlignment;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.util.Units;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTSectPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTPageMar;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTPageSz;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STSectionMark;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class DocumentConversionService {
    private static final long MAX_UPLOAD_BYTES = 25L * 1024 * 1024;
    private static final long MAX_OUTPUT_BYTES = 50L * 1024 * 1024;
    private static final Duration OFFICE_TIMEOUT = Duration.ofSeconds(45);

    @Value("${app.office.binary:soffice}")
    private String officeBinary;

    public ConversionResult convert(String format, MultipartFile upload) {
        if (upload == null || upload.isEmpty()) {
            throw new IllegalArgumentException("Choose a file to convert.");
        }
        if (upload.getSize() > MAX_UPLOAD_BYTES) {
            throw new IllegalArgumentException("Choose a file smaller than 25 MB.");
        }

        ConversionFormat conversionFormat = ConversionFormat.fromSlug(format);
        String originalName = cleanFilename(upload.getOriginalFilename());
        String extension = extensionOf(originalName);
        conversionFormat.requireInputExtension(extension);

        Path workspace = null;
        try {
            workspace = Files.createTempDirectory("kraantitools-");
            Path source = workspace.resolve("source." + extension);
            upload.transferTo(source);
            Path output = switch (conversionFormat) {
                case PDF_TO_WORD -> pdfToWord(source, workspace);
                case WORD_TO_PDF -> wordToPdf(source, workspace);
                case PPT_TO_WORD -> pptToWord(source, workspace);
                case WORD_TO_PPT -> wordToPpt(source, workspace);
            };
            long outputSize = Files.size(output);
            if (outputSize == 0 || outputSize > MAX_OUTPUT_BYTES) {
                throw new ConversionException("The converted file is too large to return. Try a smaller source file.");
            }
            return new ConversionResult(conversionFormat.outputName(originalName),
                    conversionFormat.contentType(), Files.readAllBytes(output));
        } catch (ConversionException | IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ConversionException("We couldn't read this file. Check that it is a valid, unprotected file and try again.", exception);
        } finally {
            deleteWorkspace(workspace);
        }
    }

    private Path pdfToWord(Path source, Path workspace) throws IOException, InvalidFormatException {
        Path output = workspace.resolve("converted.docx");
        try (PDDocument pdf = Loader.loadPDF(source.toFile());
             XWPFDocument word = new XWPFDocument()) {
            if (pdf.getNumberOfPages() == 0) {
                throw new ConversionException("This PDF does not contain any pages.");
            }
            if (pdf.getNumberOfPages() > 40) {
                throw new ConversionException("PDF-to-Word supports up to 40 pages. Split a larger PDF first.");
            }
            PDFRenderer renderer = new PDFRenderer(pdf);
            for (int index = 0; index < pdf.getNumberOfPages(); index++) {
                PDRectangle cropBox = pdf.getPage(index).getCropBox();
                float pageWidth = cropBox.getWidth();
                float pageHeight = cropBox.getHeight();
                int rotation = Math.floorMod(pdf.getPage(index).getRotation(), 360);
                if (rotation == 90 || rotation == 270) {
                    float dimension = pageWidth;
                    pageWidth = pageHeight;
                    pageHeight = dimension;
                }
                BufferedImage image = renderer.renderImageWithDPI(index, 180, ImageType.RGB);
                addFullPageImage(word, image, index + 1, pageWidth, pageHeight,
                        index < pdf.getNumberOfPages() - 1);
                image.flush();
            }
            try (OutputStream outputStream = Files.newOutputStream(output)) {
                word.write(outputStream);
            }
        }
        return output;
    }

    private Path wordToPdf(Path source, Path workspace) throws IOException {
        Path outputDirectory = Files.createDirectory(workspace.resolve("pdf-output"));
        Path output = outputDirectory.resolve("source.pdf");

        try {
            convertWithLibreOffice(source, outputDirectory);
            if (Files.exists(output) && Files.size(output) > 0) {
                return output;
            }
        } catch (IOException | InterruptedException exception) {
            if (exception instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new ConversionException("Word-to-PDF needs LibreOffice to preserve the original page layout. Run the Docker app or configure OFFICE_BINARY.", exception);
        }
        throw new ConversionException("LibreOffice did not create a PDF. Check the source document and try again.");
    }

    private Path pptToWord(Path source, Path workspace) throws IOException, InvalidFormatException {
        Path output = workspace.resolve("converted.docx");
        Path previewDirectory = Files.createDirectory(workspace.resolve("presentation-preview"));
        try {
            convertWithLibreOffice(source, previewDirectory);
        } catch (IOException | InterruptedException exception) {
            if (exception instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new ConversionException("PowerPoint-to-Word needs LibreOffice to preserve slide appearance. Run the Docker app or configure OFFICE_BINARY.", exception);
        }
        Path previewPdf = previewDirectory.resolve("source.pdf");
        if (!Files.exists(previewPdf) || Files.size(previewPdf) == 0) {
            throw new ConversionException("LibreOffice did not create a visual slide preview.");
        }
        try (PDDocument renderedSlides = Loader.loadPDF(previewPdf.toFile());
             XWPFDocument word = new XWPFDocument()) {
            if (renderedSlides.getNumberOfPages() == 0 || renderedSlides.getNumberOfPages() > 40) {
                throw new ConversionException("PowerPoint-to-Word supports 1 to 40 slides.");
            }
            PDFRenderer renderer = new PDFRenderer(renderedSlides);
            for (int index = 0; index < renderedSlides.getNumberOfPages(); index++) {
                PDRectangle cropBox = renderedSlides.getPage(index).getCropBox();
                float width = cropBox.getWidth();
                float height = cropBox.getHeight();
                int rotation = Math.floorMod(renderedSlides.getPage(index).getRotation(), 360);
                if (rotation == 90 || rotation == 270) {
                    float dimension = width;
                    width = height;
                    height = dimension;
                }
                BufferedImage image = renderer.renderImageWithDPI(index, 180, ImageType.RGB);
                addFullPageImage(word, image, index + 1, width, height,
                        index < renderedSlides.getNumberOfPages() - 1);
                image.flush();
            }
            try (OutputStream outputStream = Files.newOutputStream(output)) {
                word.write(outputStream);
            }
        }
        return output;
    }

    private Path wordToPpt(Path source, Path workspace) throws IOException {
        Path output = workspace.resolve("converted.pptx");
        Path previewDirectory = Files.createDirectory(workspace.resolve("document-preview"));
        try {
            convertWithLibreOffice(source, previewDirectory);
        } catch (IOException | InterruptedException exception) {
            if (exception instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new ConversionException("Word-to-PowerPoint needs LibreOffice to preserve page appearance. Run the Docker app or configure OFFICE_BINARY.", exception);
        }
        Path previewPdf = previewDirectory.resolve("source.pdf");
        if (!Files.exists(previewPdf) || Files.size(previewPdf) == 0) {
            throw new ConversionException("LibreOffice did not create a visual page preview.");
        }
        try (XMLSlideShow presentation = new XMLSlideShow()) {
            presentation.setPageSize(new Dimension(960, 540));
            addVisualReferenceSlides(presentation, previewPdf);
            try (OutputStream outputStream = Files.newOutputStream(output)) {
                presentation.write(outputStream);
            }
        }
        return output;
    }

    private void addVisualReferenceSlides(XMLSlideShow presentation, Path sourcePdf) throws IOException {
        try (PDDocument pdf = Loader.loadPDF(sourcePdf.toFile())) {
            if (pdf.getNumberOfPages() > 40) {
                throw new ConversionException("Visual Word-to-PowerPoint conversion supports up to 40 pages.");
            }
            PDFRenderer renderer = new PDFRenderer(pdf);
            Dimension slideSize = presentation.getPageSize();
            for (int pageNumber = 1; pageNumber <= pdf.getNumberOfPages(); pageNumber++) {
                BufferedImage renderedPage = renderer.renderImageWithDPI(pageNumber - 1, 180, ImageType.RGB);
                byte[] previewBytes = encodeJpeg(renderedPage, 0.94f);
                XSLFPictureData picture = presentation.addPicture(previewBytes, PictureData.PictureType.JPEG);
                XSLFSlide slide = presentation.createSlide();
                XSLFPictureShape pictureShape = slide.createPicture(picture);
                pictureShape.setAnchor(fitToSlide(renderedPage.getWidth(), renderedPage.getHeight(), slideSize));
                renderedPage.flush();
            }
        }
    }

    private Rectangle fitToSlide(int imageWidth, int imageHeight, Dimension slideSize) {
        double scale = Math.min((double) slideSize.width / imageWidth, (double) slideSize.height / imageHeight);
        int width = Math.max(1, (int) Math.round(imageWidth * scale));
        int height = Math.max(1, (int) Math.round(imageHeight * scale));
        return new Rectangle((slideSize.width - width) / 2, (slideSize.height - height) / 2, width, height);
    }

    private void addFullPageImage(XWPFDocument word, BufferedImage image, int pageNumber,
            float pageWidthPoints, float pageHeightPoints, boolean sectionBreakAfter)
            throws IOException, InvalidFormatException {
        byte[] bytes = encodeJpeg(image, 0.94f);
        XWPFParagraph paragraph = word.createParagraph();
        paragraph.setAlignment(ParagraphAlignment.CENTER);
        paragraph.setIndentationLeft(0);
        paragraph.setIndentationRight(0);
        paragraph.setSpacingBefore(0);
        paragraph.setSpacingAfter(0);
        XWPFRun run = paragraph.createRun();
        run.addPicture(new ByteArrayInputStream(bytes), XWPFDocument.PICTURE_TYPE_JPEG,
                "page-" + pageNumber + ".jpg", Units.toEMU(pageWidthPoints), Units.toEMU(pageHeightPoints));
        if (sectionBreakAfter) {
            CTSectPr section = paragraph.getCTP().getPPr().addNewSectPr();
            setPageLayout(section, pageWidthPoints, pageHeightPoints);
            section.addNewType().setVal(STSectionMark.NEXT_PAGE);
        } else {
            CTSectPr section = word.getDocument().getBody().addNewSectPr();
            setPageLayout(section, pageWidthPoints, pageHeightPoints);
        }
    }

    private void setPageLayout(CTSectPr section, float widthPoints, float heightPoints) {
        CTPageSz pageSize = section.isSetPgSz() ? section.getPgSz() : section.addNewPgSz();
        pageSize.setW(BigInteger.valueOf(Math.round(widthPoints * 20)));
        pageSize.setH(BigInteger.valueOf(Math.round(heightPoints * 20)));
        CTPageMar margins = section.isSetPgMar() ? section.getPgMar() : section.addNewPgMar();
        margins.setTop(BigInteger.ZERO);
        margins.setBottom(BigInteger.ZERO);
        margins.setLeft(BigInteger.ZERO);
        margins.setRight(BigInteger.ZERO);
        margins.setHeader(BigInteger.ZERO);
        margins.setFooter(BigInteger.ZERO);
    }

    private byte[] encodeJpeg(BufferedImage image, float quality) throws IOException {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpg").next();
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        try (ImageOutputStream output = ImageIO.createImageOutputStream(buffer)) {
            writer.setOutput(output);
            ImageWriteParam parameters = writer.getDefaultWriteParam();
            parameters.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            parameters.setCompressionQuality(quality);
            writer.write(null, new IIOImage(image, null, null), parameters);
        } finally {
            writer.dispose();
        }
        return buffer.toByteArray();
    }

    private void convertWithLibreOffice(Path source, Path outputDirectory)
            throws IOException, InterruptedException {
        Path profile = Files.createTempDirectory(outputDirectory, "office-profile-");
        Path log = outputDirectory.resolve("office.log");
        Process process = new ProcessBuilder(
                officeBinary,
                "--headless",
                "--nologo",
                "--nodefault",
                "--nolockcheck",
                "--norestore",
                "-env:UserInstallation=" + profile.toUri(),
                "--convert-to",
                "pdf",
                "--outdir",
                outputDirectory.toAbsolutePath().toString(),
                source.toAbsolutePath().toString())
                .redirectErrorStream(true)
                .redirectOutput(log.toFile())
                .start();
        boolean finished = process.waitFor(OFFICE_TIMEOUT.toSeconds(), TimeUnit.SECONDS);
        if (!finished) {
            process.destroyForcibly();
            throw new IOException("LibreOffice conversion timed out.");
        }
        if (process.exitValue() != 0) {
            throw new IOException("LibreOffice could not convert the document.");
        }
    }

    private String cleanFilename(String filename) {
        if (filename == null || filename.isBlank()) {
            throw new IllegalArgumentException("The uploaded file needs a name.");
        }
        String cleaned = Path.of(filename.replace('\\', '/')).getFileName().toString()
                .replaceAll("[\\p{Cntrl}]", "_")
                .replace('"', '_')
                .strip();
        if (cleaned.isBlank() || cleaned.equals(".")) {
            throw new IllegalArgumentException("The uploaded file name is invalid.");
        }
        return cleaned;
    }

    private String extensionOf(String filename) {
        int dot = filename.lastIndexOf('.');
        if (dot < 1 || dot == filename.length() - 1) {
            throw new IllegalArgumentException("This file needs a supported extension.");
        }
        return filename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private void deleteWorkspace(Path workspace) {
        if (workspace == null || !Files.exists(workspace)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(workspace)) {
            paths.sorted(java.util.Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                    // A best-effort cleanup keeps temporary user files from lingering.
                }
            });
        } catch (IOException ignored) {
            // The request should still return its conversion result if cleanup encounters an OS lock.
        }
    }

    private enum ConversionFormat {
        PDF_TO_WORD("pdf-to-word", "pdf", "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        WORD_TO_PDF("word-to-pdf", "docx", "pdf", "application/pdf"),
        PPT_TO_WORD("ppt-to-word", "pptx", "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        WORD_TO_PPT("word-to-ppt", "docx", "pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation");

        private final String slug;
        private final String inputExtension;
        private final String outputExtension;
        private final String contentType;

        ConversionFormat(String slug, String inputExtension, String outputExtension, String contentType) {
            this.slug = slug;
            this.inputExtension = inputExtension;
            this.outputExtension = outputExtension;
            this.contentType = contentType;
        }

        private static ConversionFormat fromSlug(String slug) {
            for (ConversionFormat format : values()) {
                if (format.slug.equals(slug)) {
                    return format;
                }
            }
            throw new IllegalArgumentException("That document conversion is not available yet.");
        }

        private void requireInputExtension(String extension) {
            if (!inputExtension.equals(extension)) {
                throw new IllegalArgumentException("This conversion needs a ." + inputExtension + " file.");
            }
        }

        private String outputName(String inputName) {
            int dot = inputName.lastIndexOf('.');
            String stem = dot > 0 ? inputName.substring(0, dot) : inputName;
            return stem + "." + outputExtension;
        }

        private String contentType() {
            return contentType;
        }
    }
}
