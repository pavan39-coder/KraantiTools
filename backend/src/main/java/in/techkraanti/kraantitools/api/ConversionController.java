package in.techkraanti.kraantitools.api;

import in.techkraanti.kraantitools.service.ConversionResult;
import in.techkraanti.kraantitools.service.DocumentConversionService;
import java.nio.charset.StandardCharsets;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1")
public class ConversionController {
    private final DocumentConversionService conversionService;

    public ConversionController(DocumentConversionService conversionService) {
        this.conversionService = conversionService;
    }

    @GetMapping("/health")
    public ApiHealth health() {
        return new ApiHealth("ok", "kraantitools-api");
    }

    @PostMapping(value = "/conversions/{format}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ByteArrayResource> convert(
            @PathVariable String format,
            @RequestParam("file") MultipartFile file) {
        ConversionResult result = conversionService.convert(format, file);
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(result.filename(), StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(result.contentType()))
                .contentLength(result.bytes().length)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header("X-Content-Type-Options", "nosniff")
                .header("Cache-Control", "no-store")
                .body(new ByteArrayResource(result.bytes()));
    }

    public record ApiHealth(String status, String service) {
    }
}
