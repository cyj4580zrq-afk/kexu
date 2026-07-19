import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageFile = fileURLToPath(new URL("../ios/App/CapApp-SPM/Package.swift", import.meta.url));
const source = readFileSync(packageFile, "utf8");
const normalized = source.replace(/path: "([^"]+)"/g, (_match, path) => {
  return `path: "${path.replaceAll("\\", "/")}"`;
});

if (normalized !== source) writeFileSync(packageFile, normalized, "utf8");
