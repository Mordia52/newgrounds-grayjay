#!/usr/bin/env node

/**
 * Sign the plugin script and update config.json with signature and public key
 *
 * This script:
 * 1. Checks for or generates a signing key in .secrets/signing_key.pem
 * 2. Generates a SHA512 signature of dist/script.js
 * 3. Extracts the public key from the private key
 * 4. Updates dist/config.json with scriptSignature and scriptPublicKey
 */

const utils = require("./utils");
const {
  log,
  colors,
  execCommand,
  execCommandInherit,
  readJsonFile,
  writeJsonFile,
  ensureDir,
  checkOpenSSL,
} = utils;
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SECRETS_DIR = path.join(__dirname, "..", ".secrets");
const PRIVATE_KEY_PATH = path.join(SECRETS_DIR, "signing_key.pem");
const SCRIPT_PATH = path.join(__dirname, "..", "dist", "script.js");
const CONFIG_PATH = path.join(__dirname, "..", "dist", "config.json");

function ensurePrivateKey() {
  // Create .secrets directory if it doesn't exist
  ensureDir(SECRETS_DIR);

  // Generate private key if it doesn't exist
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    log("🔑 Generating new RSA private key...", colors.yellow);
    try {
      execSync(`openssl genrsa -out "${PRIVATE_KEY_PATH}" 2048`, {
        stdio: "inherit",
      });
      log("✅ Private key generated successfully!", colors.green);
    } catch (error) {
      log("❌ Failed to generate private key", colors.red);
      throw error;
    }
  } else {
    log("🔑 Using existing private key", colors.cyan);
  }

  // Validate private key
  try {
    execSync(`openssl rsa -check -noout -in "${PRIVATE_KEY_PATH}"`, {
      stdio: "pipe",
    });
    log("✅ Private key is valid", colors.green);
  } catch (error) {
    log("❌ Invalid private key", colors.red);
    throw new Error("Private key validation failed");
  }
}

function generateSignature() {
  if (!fs.existsSync(SCRIPT_PATH)) {
    throw new Error(
      `Script file not found: ${SCRIPT_PATH}. Run 'npm run build' first.`
    );
  }

  log("\n📝 Generating signature for script.js...", colors.cyan);

  try {
    const signature = execSync(
      `openssl dgst -sha512 -sign "${PRIVATE_KEY_PATH}" "${SCRIPT_PATH}" | openssl base64 -A`,
      { encoding: "utf8" }
    ).trim();

    log("✅ Signature generated", colors.green);
    return signature;
  } catch (error) {
    log("❌ Failed to generate signature", colors.red);
    throw error;
  }
}

function extractPublicKey() {
  log("🔓 Extracting public key...", colors.cyan);

  try {
    // Extract public key in two steps for better Windows compatibility
    const publicKeyPem = execSync(
      `openssl rsa -pubout -outform PEM -in "${PRIVATE_KEY_PATH}"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }
    );

    // Remove BEGIN/END lines and newlines (handle both LF and CRLF)
    const publicKey = publicKeyPem
      .replace(/\r/g, "")
      .split("\n")
      .filter(
        (line) =>
          !line.includes("BEGIN") && !line.includes("END") && line.trim()
      )
      .join("")
      .trim();

    log("✅ Public key extracted", colors.green);
    return publicKey;
  } catch (error) {
    log("❌ Failed to extract public key", colors.red);
    throw error;
  }
}

function updateConfig(signature, publicKey) {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `Config file not found: ${CONFIG_PATH}. Run 'npm run build' first.`
    );
  }

  log("\n📄 Updating config.json...", colors.cyan);

  try {
    const config = readJsonFile(CONFIG_PATH);
    config.scriptSignature = signature;
    config.scriptPublicKey = publicKey;

    writeJsonFile(CONFIG_PATH, config);
    log("✅ config.json updated with signature and public key", colors.green);
  } catch (error) {
    log("❌ Failed to update config.json", colors.red);
    throw error;
  }
}

function main() {
  log("\n🔐 GrayJay Plugin Signing Tool\n", colors.cyan);

  // Check for OpenSSL (included with Git for Windows)
  if (!checkOpenSSL()) {
    log(
      "\n💡 Quick fix for PowerShell users:",
      colors.cyan
    );
    log(
      "   Run these commands in your PowerShell session:",
      colors.cyan
    );
    log(
      "   Import-Module $env:ChocolateyInstall\\helpers\\chocolateyProfile.psm1",
      colors.yellow
    );
    log(
      "   refreshenv",
      colors.yellow
    );
    log(
      "   npm run sign  # Try again",
      colors.green
    );
    process.exit(1);
  }

  try {
    // Ensure private key exists and is valid
    ensurePrivateKey();

    // Generate signature
    const signature = generateSignature();

    // Extract public key
    const publicKey = extractPublicKey();

    // Update config.json
    updateConfig(signature, publicKey);

    log("\n✅ Plugin signed successfully!\n", colors.green);
    log("📋 Summary:", colors.cyan);
    log(`   Private Key: ${PRIVATE_KEY_PATH}`, colors.reset);
    log(`   Signature Length: ${signature.length} chars`, colors.reset);
    log(`   Public Key Length: ${publicKey.length} chars`, colors.reset);
  } catch (error) {
    log("\n❌ Signing failed:", colors.red);
    console.error(error.message);
    process.exit(1);
  }
}

main();
