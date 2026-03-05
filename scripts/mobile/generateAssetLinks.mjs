import fs from "node:fs";
import path from "node:path";

const usage = `
Usage:
  node scripts/mobile/generateAssetLinks.mjs --package com.servfix.app --fingerprint AA:BB:... --output public/.well-known/assetlinks.json
  npm run mobile:assetlinks   # reads SERVFIX_ANDROID_PACKAGE and SERVFIX_ANDROID_SHA256 from env

Options:
  --package       Android package name (or set SERVFIX_ANDROID_PACKAGE)
  --fingerprint   SHA256 cert fingerprint(s), comma-separated (or set SERVFIX_ANDROID_SHA256)
  --output        Output path (default: public/.well-known/assetlinks.json or SERVFIX_ASSETLINKS_OUTPUT)
  --help          Show this help
`.trim();

const parseArgs = (argv) => {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = token.split("=", 2);
    const key = rawKey.slice(2);

    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
      continue;
    }

    args[key] = "true";
  }

  return args;
};

const isSha256Fingerprint = (value) => /^[A-Fa-f0-9]{2}(?::[A-Fa-f0-9]{2}){31}$/.test(value);

const args = parseArgs(process.argv.slice(2));

if (args.help === "true") {
  console.log(usage);
  process.exit(0);
}

const packageName = args.package || process.env.SERVFIX_ANDROID_PACKAGE;
const outputFile = args.output || process.env.SERVFIX_ASSETLINKS_OUTPUT || "public/.well-known/assetlinks.json";
const fingerprints = (args.fingerprint || process.env.SERVFIX_ANDROID_SHA256 || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!packageName || fingerprints.length === 0) {
  console.error(usage);
  process.exit(1);
}

const invalidFingerprint = fingerprints.find((value) => !isSha256Fingerprint(value));
if (invalidFingerprint) {
  console.error(
    `Invalid fingerprint: "${invalidFingerprint}". Expected 32-byte SHA256 format with colon separators.`,
  );
  process.exit(1);
}

const payload = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: packageName,
      sha256_cert_fingerprints: fingerprints,
    },
  },
];

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Wrote ${outputFile}`);
