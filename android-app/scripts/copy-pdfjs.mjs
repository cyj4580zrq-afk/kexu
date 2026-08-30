import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "node_modules/pdfjs-dist/legacy/build/pdf.mjs");
const destination = resolve(root, "www/vendor/pdf.mjs");

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
