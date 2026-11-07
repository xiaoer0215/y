import fs from "node:fs";
import path from "node:path";
import { createHash, createPublicKey, verify } from "node:crypto";
import { execFileSync } from "node:child_process";

const catalog = JSON.parse(fs.readFileSync("brands/versions.json", "utf8"));
const repoName = process.env.GITHUB_REPOSITORY?.split("/").pop();
const brandId = process.env.AI_HELPER_BRAND_ID ||
  ({ u: "uocode", n: "nez-api", y: "yusr" }[repoName] || catalog.default);
const brand = catalog.versions.find((item) => item.id === brandId && item.enabled);
if (!brand) throw new Error(`Unknown brand: ${brandId}`);
const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
const slug = brand.userAgentName.replace(/[^A-Za-z0-9.-]+/g, "-");
const prefix = `${slug}-v${version}`;
const assets = path.resolve("release/assets");
fs.mkdirSync(assets, { recursive: true });

function copy(source, name) {
  if (!fs.statSync(source).isFile()) throw new Error(`Missing package: ${source}`);
  fs.copyFileSync(source, path.join(assets, name));
  console.log(`Packaged ${name}`);
}

function oneFile(directory, suffix) {
  const files = fs.readdirSync(directory).filter((file) => file.endsWith(suffix));
  if (files.length !== 1) throw new Error(`Expected one ${suffix} in ${directory}, found ${files.length}`);
  return path.join(directory, files[0]);
}

function verifySignature(name) {
  const signature = fs.readFileSync(path.join(assets, `${name}.sig`), "utf8").trim();
  const lines = Buffer.from(signature, "base64").toString("utf8").trim().split(/\r?\n/);
  const publicLines = Buffer.from(brand.updaterPublicKey, "base64").toString("utf8").trim().split(/\r?\n/);
  const rawKey = Buffer.from(publicLines[1], "base64");
  const rawSig = Buffer.from(lines[1], "base64");
  if (rawKey.length !== 42 || rawSig.length !== 74 || !rawKey.subarray(2, 10).equals(rawSig.subarray(2, 10))) {
    throw new Error(`Signing key does not match ${name}`);
  }
  const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), rawKey.subarray(10)]), format: "der", type: "spki" });
  const data = fs.readFileSync(path.join(assets, name));
  const algorithm = rawSig.subarray(0, 2).toString("ascii");
  if (!["Ed", "ED"].includes(algorithm)) throw new Error(`Unsupported signature: ${algorithm}`);
  const message = algorithm === "ED" ? createHash("blake2b512").update(data).digest() : data;
  if (!verify(null, message, publicKey, rawSig.subarray(10))) throw new Error(`Invalid package signature: ${name}`);
  const trusted = lines[2]?.replace(/^trusted comment: /, "");
  if (!trusted || !verify(null, Buffer.concat([rawSig.subarray(10), Buffer.from(trusted)]), publicKey, Buffer.from(lines[3] || "", "base64"))) {
    throw new Error(`Invalid trusted signature: ${name}`);
  }
  return signature;
}

const [platform, target] = process.argv.slice(2);
if (platform === "windows-x86_64") {
  const build = path.resolve("src-tauri/target/release");
  const installer = oneFile(path.join(build, "bundle/nsis"), "-setup.exe");
  const name = `${prefix}-Windows-x64-Setup.exe`;
  copy(installer, name);
  copy(`${installer}.sig`, `${name}.sig`);
  const standalone = path.resolve("release/standalone");
  fs.mkdirSync(standalone, { recursive: true });
  for (const [source, destination] of [
    [path.join(build, "ai-helper.exe"), `${slug}.exe`],
    ["LICENSE", "LICENSE.txt"],
    ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"],
    ["docs/standalone-readme.txt", "README.txt"],
  ]) fs.copyFileSync(source, path.join(standalone, destination));
  const zip = path.join(assets, `${prefix}-Windows-x64-Standalone.zip`);
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  execFileSync("pwsh", ["-NoProfile", "-Command", `Compress-Archive -Path ${quote(path.join(standalone, "*"))} -DestinationPath ${quote(zip)} -Force`], { stdio: "inherit" });
  verifySignature(name);
} else if (["darwin-aarch64", "darwin-x86_64"].includes(platform)) {
  const build = path.resolve(`src-tauri/target/${target}/release/bundle`);
  const arch = platform === "darwin-aarch64" ? "aarch64" : "x64";
  copy(oneFile(path.join(build, "dmg"), ".dmg"), `${prefix}-macOS-${arch}.dmg`);
  const updater = oneFile(path.join(build, "macos"), ".app.tar.gz");
  const name = `${prefix}-macOS-${arch}.app.tar.gz`;
  copy(updater, name);
  copy(`${updater}.sig`, `${name}.sig`);
  verifySignature(name);
} else if (platform === "manifest") {
  const platforms = {};
  // Release assets remain on GitHub by default. Site mirrors can set this to
  // their public download directory when generating the mirror manifest.
  const assetBase = (
    process.env.AI_HELPER_UPDATE_ASSET_BASE_URL ||
    `https://github.com/${brand.repository}/releases/download/v${version}`
  ).replace(/\/+$/, "");
  const packages = {
    "windows-x86_64": `${prefix}-Windows-x64-Setup.exe`,
    "darwin-aarch64": `${prefix}-macOS-aarch64.app.tar.gz`,
    "darwin-x86_64": `${prefix}-macOS-x64.app.tar.gz`,
  };
  for (const required of [`${prefix}-Windows-x64-Standalone.zip`, `${prefix}-macOS-aarch64.dmg`, `${prefix}-macOS-x64.dmg`]) {
    if (fs.statSync(path.join(assets, required)).size < 1024) throw new Error(`Empty package: ${required}`);
  }
  for (const [platform, name] of Object.entries(packages)) {
    platforms[platform] = {
      signature: verifySignature(name),
      url: `${assetBase}/${name}`,
    };
  }
  const notes = fs.readFileSync(`docs/releases/v${version}.md`, "utf8");
  fs.writeFileSync(path.join(assets, "latest.json"), JSON.stringify({ version, notes, pub_date: new Date().toISOString(), platforms }, null, 2) + "\n");
  fs.writeFileSync(path.join(assets, "build-info.json"), JSON.stringify({ brand: brand.id, productName: brand.productName, siteUrl: brand.siteUrl, repository: brand.repository, version, commit: process.env.GITHUB_SHA }, null, 2) + "\n");
  const checksums = fs.readdirSync(assets).filter((file) => file !== "SHA256SUMS.txt").sort().map((file) => `${createHash("sha256").update(fs.readFileSync(path.join(assets, file))).digest("hex")}  ${file}`);
  fs.writeFileSync(path.join(assets, "SHA256SUMS.txt"), checksums.join("\n") + "\n");
  console.log(`Verified ${brand.productName} ${version}: Windows and two macOS architectures`);
} else {
  throw new Error(`Unknown package platform: ${platform}`);
}
