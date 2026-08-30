import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/plugin/util/HttpRequestHandler.java");
const original = `        call.getData().put("activeCapacitorHttpUrlConnection", connection);
        connection.connect();

        JSObject response = buildResponse(connection, responseType);

        connection.disconnect();
        call.getData().remove("activeCapacitorHttpUrlConnection");

        return response;`;
const replacement = `        call.getData().put("activeCapacitorHttpUrlConnection", connection);
        try {
            connection.connect();
            return buildResponse(connection, responseType);
        } finally {
            connection.disconnect();
            call.getData().remove("activeCapacitorHttpUrlConnection");
        }`;

const content = await readFile(source, "utf8");
if (content.includes("try {\n            connection.connect();\n            return buildResponse(connection, responseType);")) process.exit(0);
if (!content.includes(original)) throw new Error("Capacitor HTTP source format changed; connection cleanup patch was not applied.");
await writeFile(source, content.replace(original, replacement));
