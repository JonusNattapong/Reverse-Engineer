/**
 * ConfigManager - Persistent config storage for blueprompt
 * 
 * Stores API keys and settings in a platform-standard location:
 *   Windows:  %APPDATA%/blueprompt/config.json
 *   macOS:    ~/Library/Application Support/blueprompt/config.json
 *   Linux:    ~/.config/blueprompt/config.json
 * 
 * This ensures keys persist across npx runs, different working directories,
 * and system reboots.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

function getConfigDir() {
  const platform = os.platform();
  if (platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "blueprompt");
  } else if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "blueprompt");
  } else {
    return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "blueprompt");
  }
}

const CONFIG_DIR = getConfigDir();
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    }
  } catch (e) {
    // Corrupted config, start fresh
  }
  return {};
}

function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

/**
 * Get a config value
 */
function get(key) {
  const config = loadConfig();
  return config[key] || null;
}

/**
 * Set a config value and persist to disk
 */
function set(key, value) {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
}

/**
 * Load all stored keys into process.env so existing code works seamlessly.
 * This bridges the gap - old code reads process.env, we just inject from config.
 * Priority: process.env (already set) > config file > nothing
 */
function injectIntoProcessEnv() {
  const config = loadConfig();
  for (const [key, value] of Object.entries(config)) {
    if (!process.env[key] && value) {
      process.env[key] = value;
    }
  }
}

/**
 * Migrate existing .env file into config store (one-time upgrade)
 */
function migrateFromDotEnv(dotEnvPath) {
  if (!fs.existsSync(dotEnvPath)) return false;
  
  const content = fs.readFileSync(dotEnvPath, "utf8");
  const config = loadConfig();
  let migrated = false;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    
    const key = trimmed.substring(0, eqIndex).trim();
    const value = trimmed.substring(eqIndex + 1).trim();
    
    if (value && !config[key]) {
      config[key] = value;
      migrated = true;
    }
  }

  if (migrated) {
    saveConfig(config);
  }
  return migrated;
}

/**
 * Get the path where config is stored (for display purposes)
 */
function getConfigPath() {
  return CONFIG_FILE;
}

module.exports = {
  get,
  set,
  loadConfig,
  saveConfig,
  injectIntoProcessEnv,
  migrateFromDotEnv,
  getConfigDir,
  getConfigPath,
};
