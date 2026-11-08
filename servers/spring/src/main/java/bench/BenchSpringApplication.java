package bench;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import java.util.List;
import java.util.stream.IntStream;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Spring Boot bench server (docs/adr/0001-what-the-benchmark-answers.md, "The servers"), written the way Spring's
 * guides write one: a {@code @RestController} in a {@code @SpringBootApplication}, Spring MVC on its embedded
 * Tomcat, at Spring Boot's defaults. The 64 MiB file comes from Spring Boot's static resource handling.
 */
@SpringBootApplication
@RestController
public class BenchSpringApplication {

	// the order serde_json and JSON.stringify write, so every server sends the same bytes
	@JsonPropertyOrder({"id", "sku", "name", "tags", "price_cents", "in_stock"})
	record Item(int id, String sku, String name, List<String> tags, long price_cents, boolean in_stock) {}

	@JsonPropertyOrder({"page", "per_page", "total", "items"})
	record Page(int page, int per_page, int total, List<Item> items) {}

	private static final List<String> TAGS = List.of("outdoor", "steel", "refurbished", "bulk", "eco", "imported");

	/** A page of {@code items} items, built on every request, as servers/common builds it. */
	static Page catalog(int items) {
		List<Item> rows = IntStream.range(0, items)
				.mapToObj(i -> new Item(
						10_000 + i,
						String.format("WF-%05d-%d", 31_337 + i * 17, i % 3),
						"Item number " + (i + 1) + " of the bench catalog",
						TAGS.subList(i % 3, i % 3 + 3),
						1_999 + (long) i * 250,
						i % 4 != 0))
				.toList();
		return new Page(1, items, 30 * items, rows);
	}

	/** Byte {@code i % 251} at offset {@code i}, as every server's bodies and the file hold. */
	static byte[] pattern(int len) {
		byte[] b = new byte[len];
		for (int i = 0; i < len; i++) b[i] = (byte) (i % 251);
		return b;
	}

	private static final byte[] B16K = pattern(16 * 1024);
	private static final byte[] B323K = pattern(323_000);

	private static ResponseEntity<byte[]> bytes(byte[] body) {
		return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM).body(body);
	}

	@GetMapping("/json")
	Page json() {
		return catalog(8);
	}

	@GetMapping("/json-40k")
	Page json40k() {
		return catalog(263);
	}

	@GetMapping("/json-323k")
	Page json323k() {
		return catalog(2_100);
	}

	@GetMapping("/16k")
	ResponseEntity<byte[]> b16k() {
		return bytes(B16K);
	}

	@GetMapping("/323k")
	ResponseEntity<byte[]> b323k() {
		return bytes(B323K);
	}

	@GetMapping("/323k-fresh")
	ResponseEntity<byte[]> b323kFresh() {
		return bytes(B323K.clone());
	}

	public static void main(String[] args) {
		SpringApplication.run(BenchSpringApplication.class, args);
	}
}
