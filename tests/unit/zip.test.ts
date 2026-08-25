import { describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import { createZipBuffer } from "../../src/server/zip.js";

describe("createZipBuffer", () => {
  it("builds a readable zip with multiple text files", () => {
    const zip = createZipBuffer([
      { name: "application.md", content: "# App\n" },
      { name: "pages.md", content: "# Pages\n" },
      { name: "application.json", content: "{\"ok\":true}" },
    ]);

    expect(zip.subarray(0, 4).toString("binary")).toBe("PK\u0003\u0004");
    expect(zip.includes(Buffer.from("application.md"))).toBe(true);
    expect(zip.includes(Buffer.from("pages.md"))).toBe(true);

    // Local header for first file → skip 30 + name length, then inflate
    const nameLen = zip.readUInt16LE(26);
    const compSize = zip.readUInt32LE(18);
    const dataStart = 30 + nameLen;
    const compressed = zip.subarray(dataStart, dataStart + compSize);
    const plain = inflateRawSync(compressed).toString("utf8");
    expect(plain).toBe("# App\n");
  });
});
