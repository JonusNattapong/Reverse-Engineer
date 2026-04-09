const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const { createParser } = require("eventsource-parser");
const axios = require("axios");
const cheerio = require("cheerio");
const { SandboxAgent } = require("./agent");
const configManager = require("../lib/configManager");
const promptManager = require("../lib/promptManager");

// Load persistent config first, then let .env override
configManager.migrateFromDotEnv(path.join(__dirname, "..", ".env"));
configManager.injectIntoProcessEnv();
dotenv.config();

const app = express();
const PORT = 4040; // Force 4040 for absolute system synchronization
const MAX_FILE_CHARS = 12000;
const MAX_TREE_ENTRIES = 200;
const PROVIDER_DEFAULTS = {
  openai: {
    label: "OpenAI",
    model: process.env.OPENAI_MODEL || "gpt-4o",
  },
  anthropic: {
    label: "Anthropic",
    model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
  },
  gemini: {
    label: "Google Gemini",
    model: process.env.GEMINI_MODEL || "gemini-1.5-pro",
  },
  openrouter: {
    label: "OpenRouter",
    model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
  },
  groq: {
    label: "Groq",
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  },
  xai: {
    label: "xAI",
    model: process.env.XAI_MODEL || "grok-beta",
  },
  mistral: {
    label: "Mistral",
    model: process.env.MISTRAL_MODEL || "mistral-medium-latest",
  },
  ollama: {
    label: "Ollama",
    model: process.env.OLLAMA_MODEL || "llama3.2",
  },
  kilocode: {
    label: "KiloCode",
    model: process.env.KILOCODE_MODEL || "kilocode/kilo/auto",
  },
};

app.use(express.json({ limit: "2mb" }));
// Point to the public folder relative to this file
app.use(express.static(path.join(__dirname, "..", "public")));

function parseGitHubUrl(input) {
  let url;

  try {
    url = new URL(String(input || "").trim());
  } catch {
    throw new Error("URL ไม่ถูกต้อง");
  }

  if (url.hostname !== "github.com") {
    throw new Error("รองรับเฉพาะลิงก์จาก github.com");
  }

  const parts = url.pathname.split("/").filter(Boolean);

  if (parts.length < 2) {
    throw new Error("หา owner/repo จาก URL นี้ไม่ได้");
  }

  const [owner, repo, mode, branch, ...rest] = parts;
  const parsed = {
    owner,
    repo,
    branch: branch || null,
    type: "repository",
    path: "",
    url: url.toString(),
  };

  if (mode === "blob" || mode === "tree") {
    parsed.type = mode === "blob" ? "file" : "directory";
    parsed.path = rest.join("/");
  }

  return parsed;
}

function githubHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "reverse-engineer-app",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

function encodePathSegments(value) {
  return String(value || "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed (${response.status}): ${text}`);
  }

  return response.json();
}

function decodeBase64(content) {
  return Buffer.from(content.replace(/\n/g, ""), "base64").toString("utf8");
}

function limitText(text, limit = MAX_FILE_CHARS) {
  if (!text) {
    return "";
  }

  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit)}\n\n...[truncated ${text.length - limit} chars]`;
}

function summarizeTreeItems(items, prefix) {
  const normalizedPrefix = prefix ? `${prefix.replace(/^\/+|\/+$/g, "")}/` : "";
  const filtered = items
    .filter((item) => item.path !== prefix)
    .filter((item) => !normalizedPrefix || item.path.startsWith(normalizedPrefix))
    .slice(0, MAX_TREE_ENTRIES)
    .map((item) => ({
      path: item.path,
      type: item.type,
      size: item.size || null,
    }));

  return filtered;
}

async function getRepoDetails(owner, repo) {
  return fetchJson(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    {
      headers: githubHeaders(),
    }
  );
}

async function getBranchTreeSha(owner, repo, branch) {
  const branchData = await fetchJson(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`,
    { headers: githubHeaders() }
  );

  return branchData.commit.commit.tree.sha;
}

async function getTree(owner, repo, treeSha) {
  const tree = await fetchJson(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
    { headers: githubHeaders() }
  );

  return tree.tree || [];
}

async function getFileContent(owner, repo, pathName, branch) {
  const encodedPath = encodePathSegments(pathName);
  const content = await fetchJson(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
    { headers: githubHeaders() }
  );

  if (content.type !== "file") {
    throw new Error("ลิงก์นี้ไม่ได้ชี้ไปที่ไฟล์");
  }

  return {
    name: content.name,
    path: content.path,
    size: content.size,
    sha: content.sha,
    downloadUrl: content.download_url,
    content: limitText(decodeBase64(content.content || "")),
  };
}

/**
 * Orchestrate the inspection of a GitHub URL
 */
async function inspectGitHubUrl(url) {
  const parsed = parseGitHubUrl(url);
  const repoDetails = await getRepoDetails(parsed.owner, parsed.repo);
  const branch = parsed.branch || repoDetails.default_branch;

  const context = {
    metadata: {
      ...parsed,
      branch,
      private: repoDetails.private,
      description: repoDetails.description,
    },
    tree: [],
    file: null,
  };

  if (parsed.type === "file") {
    context.file = await getFileContent(
      parsed.owner,
      parsed.repo,
      parsed.path,
      branch
    );
  }

  const treeSha = await getBranchTreeSha(parsed.owner, parsed.repo, branch);
  const fullTree = await getTree(parsed.owner, parsed.repo, treeSha);
  context.tree = summarizeTreeItems(fullTree, parsed.path);

  if (!context.file && (parsed.type === "repository" || parsed.type === "directory")) {
    const readme = fullTree.find(
      (item) => item.path.toLowerCase() === "readme.md"
    );
    if (readme) {
      const readmeData = await fetchJson(readme.url, {
        headers: githubHeaders(),
      });
      context.readme = {
        path: readme.path,
        content: limitText(decodeBase64(readmeData.content || "")),
      };
    }
  }

  return context;
}

async function inspectLocalPath(localPath) {
  const fullPath = path.resolve(localPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Path not found: ${localPath}`);
  }

  const isDir = fs.statSync(fullPath).isDirectory();
  const context = {
    metadata: {
      owner: "local",
      repo: path.basename(fullPath),
      branch: "local",
      type: isDir ? "directory" : "file",
      path: fullPath,
      url: `file://${fullPath}`,
      private: true,
      description: "Local filesystem analysis",
    },
    tree: [],
    file: null,
  };

  if (!isDir) {
    const content = fs.readFileSync(fullPath, "utf8");
    context.file = {
      name: path.basename(fullPath),
      path: fullPath,
      size: fs.statSync(fullPath).size,
      content: limitText(content),
    };
    const parent = path.dirname(fullPath);
    context.tree = fs.readdirSync(parent).slice(0, MAX_TREE_ENTRIES).map(f => ({
      path: f,
      type: fs.statSync(path.join(parent, f)).isDirectory() ? "tree" : "blob",
      size: fs.statSync(path.join(parent, f)).size
    }));
  } else {
    context.tree = fs.readdirSync(fullPath).slice(0, MAX_TREE_ENTRIES).map(f => ({
      path: f,
      type: fs.statSync(path.join(fullPath, f)).isDirectory() ? "tree" : "blob",
      size: fs.statSync(path.join(fullPath, f)).size
    }));
    
    const readme = ["README.md", "readme.md"].find(f => fs.existsSync(path.join(fullPath, f)));
    if (readme) {
      context.readme = {
        path: readme,
        content: limitText(fs.readFileSync(path.join(fullPath, readme), "utf8"))
      };
    }
  }

  return context;
}

async function inspectWebsiteUrl(url) {
  try {
    const res = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0 ReverseEngineer/1.0" } });
    const $ = cheerio.load(res.data);
    
    const meta = {
      title: $("title").text().trim() || "Website",
      description: $('meta[name="description"]').attr("content") || "",
      generator: $('meta[name="generator"]').attr("content") || "",
    };

    const scripts = $("script[src]").map((_, el) => $(el).attr("src")).get();
    
    return {
      metadata: {
        owner: new URL(url).hostname,
        repo: meta.title || "Website",
        branch: "live",
        type: "website",
        path: url,
        url: url,
        private: false,
        description: meta.description || "Website analysis",
      },
      tree: scripts.map(s => ({ path: s, type: "blob", size: 0 })),
      file: {
          path: "index.html",
          content: `Website: ${meta.title || "Unknown"}\nDescription: ${meta.description || "N/A"}\nScripts: ${scripts.length} detected.`,
          size: 0
      }
    };
  } catch(e) {
    throw new Error(`Failed to inspect website: ${e.message}`);
  }
}

async function inspectTarget(target) {
  if (target.startsWith("http")) {
    if (target.includes("github.com")) {
      return inspectGitHubUrl(target);
    } else {
      return inspectWebsiteUrl(target);
    }
  }
  return inspectLocalPath(target);
}

function buildAnalysisPrompt({
  githubContext,
  goal,
  outputStyle,
  language,
  extraContext,
}) {
  const target = githubContext.metadata;
  const treeText = githubContext.tree.length
    ? githubContext.tree
        .map((item) => `- ${item.type}: ${item.path}${item.size ? ` (${item.size} bytes)` : ""}`)
        .join("\n")
    : "- No tree entries available";

  const fileText = githubContext.file
    ? `File content preview from ${githubContext.file.path}:\n${githubContext.file.content}`
    : "No direct file content provided for this target.";

  const readmeText = githubContext.readme
    ? `Repository README preview:\n${githubContext.readme.content}`
    : "No README preview attached.";

  const baseInstruction = outputStyle === "blueprint" 
    ? promptManager.getPrompt("blueprint")
    : outputStyle === "security"
    ? promptManager.getPrompt("security")
    : outputStyle === "refactoring"
    ? promptManager.getPrompt("refactoring")
    : outputStyle === "perfection"
    ? promptManager.getPrompt("perfection")
    : `${promptManager.getPrompt("default")} Produce a: ${outputStyle || "summary"} in ${language || "Thai"}.`;

  return [
    `# SYSTEM PROMPT: ${outputStyle.toUpperCase()} MODE`,
    baseInstruction,
    `---`,
    `### CONTEXTUAL DATA:`,
    `Target metadata:
-- URL: ${target.url}
-- Repository: ${target.owner}/${target.repo}
-- Branch: ${target.branch}
-- Type: ${target.type}
-- Path: ${target.path}
-- Description: ${target.description || "N/A"}`,
    `Primary goal: ${
      goal ||
      "ช่วย reverse engineer โค้ดในส่วนนี้เพื่อสร้างเป็นพิมพ์เขียวสำหรับพัฒนาต่อ"
    }`,
    `Requested language: ${language || "Thai"}`,
    extraContext ? `Additional context: ${extraContext}` : "Additional context: none",
    `Repository tree preview:\n${treeText}`,
    fileText,
    readmeText,
    outputStyle === "blueprint" 
      ? `FINAL OUTPUT FORMAT: A single, long, well-structured System Specification Prompt. Start immediately with 'Act as an expert developer...'`
      : `Please produce a professional, structured document following the guidelines provided in the instruction above.`
  ].join("\n\n");
}

function getProviderCatalog() {
  return {
    openai: {
      ...PROVIDER_DEFAULTS.openai,
      configured: Boolean(process.env.OPENAI_API_KEY),
    },
    anthropic: {
      ...PROVIDER_DEFAULTS.anthropic,
      configured: Boolean(process.env.ANTHROPIC_API_KEY),
    },
    gemini: {
      ...PROVIDER_DEFAULTS.gemini,
      configured: Boolean(process.env.GEMINI_API_KEY),
    },
    openrouter: {
      ...PROVIDER_DEFAULTS.openrouter,
      configured: Boolean(process.env.OPENROUTER_API_KEY),
    },
    groq: {
      ...PROVIDER_DEFAULTS.groq,
      configured: Boolean(process.env.GROQ_API_KEY),
    },
    xai: {
      ...PROVIDER_DEFAULTS.xai,
      configured: Boolean(process.env.XAI_API_KEY),
    },
    mistral: {
      ...PROVIDER_DEFAULTS.mistral,
      configured: Boolean(process.env.MISTRAL_API_KEY),
    },
    ollama: {
      ...PROVIDER_DEFAULTS.ollama,
      configured: true,
      baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    },
    kilocode: {
      ...PROVIDER_DEFAULTS.kilocode,
      configured: Boolean(process.env.KILOCODE_API_KEY),
      baseUrl: process.env.KILOCODE_BASE_URL || "https://api.kilo.ai/api/gateway",
    },
  };
}

function resolveProvider(providerName, requestedModel) {
  const provider = String(providerName || "openai").trim().toLowerCase();
  const catalog = getProviderCatalog();
  const selected = catalog[provider];

  if (!selected) {
    throw new Error(`provider ไม่รองรับ: ${provider}`);
  }

  return {
    provider,
    label: selected.label,
    model: requestedModel || selected.model,
    configured: selected.configured,
    baseUrl: selected.baseUrl || null,
  };
}

async function postJson(url, { headers, body }) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Provider API error (${response.status}): ${text}`);
  }

  return response.json();
}

function extractAnthropicText(data) {
  return (data.content || [])
    .filter((item) => item.type === "text")
    .map((item) => item.text || "")
    .join("\n")
    .trim();
}

function extractGeminiText(data) {
  return (data.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("\n")
    .trim();
}

function extractChatCompletionText(data) {
  return (data.choices || [])
    .map((choice) => choice.message?.content || "")
    .join("\n")
    .trim();
}

async function analyzeWithProvider(payload, onChunk = null) {
  const prompt = buildAnalysisPrompt(payload);
  const selected = resolveProvider(payload.provider, payload.model);
  let outputText = "";

  const isStream = typeof onChunk === "function";

  if (selected.provider === "openai") {
    if (!process.env.OPENAI_API_KEY) throw new Error("ยังไม่ได้ตั้งค่า OPENAI_API_KEY");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: selected.model,
        stream: isStream,
        messages: [
          { role: "system", content: "Answer clearly and practically. Be explicit about what is directly observed." },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Error (${response.status}): ${errorText}`);
    }

    if (isStream) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      const parser = createParser({
        onEvent: (event) => {
          if (event.type === "event") {
            if (event.data === "[DONE]") return;
            try {
              const json = JSON.parse(event.data);
              const content = json.choices[0]?.delta?.content || "";
              if (content) {
                outputText += content;
                onChunk(content);
              }
            } catch {}
          }
        }
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.feed(decoder.decode(value, { stream: true }));
      }
    } else {
      const data = await response.json();
      outputText = extractChatCompletionText(data);
    }
  } else if (selected.provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: selected.model,
        max_tokens: 8192,
        stream: isStream,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic Error (${response.status}): ${errorText}`);
    }

    if (isStream) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      const parser = createParser({
        onEvent: (event) => {
          if (event.type === "event") {
            try {
              const json = JSON.parse(event.data);
              if (json.type === "content_block_delta") {
                const content = json.delta?.text || "";
                outputText += content;
                onChunk(content);
              }
            } catch {}
          }
        }
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.feed(decoder.decode(value, { stream: true }));
      }
    } else {
      const data = await response.json();
      outputText = extractAnthropicText(data);
    }
  } else {
    // KiloCode, Groq, xAI, etc. (OpenAI-Compatible)
    const apiKey = process.env[`${selected.provider.toUpperCase()}_API_KEY`];
    const url = selected.baseUrl ? `${selected.baseUrl}/chat/completions` : "https://api.openai.com/v1/chat/completions";
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: selected.model,
        stream: isStream,
        max_tokens: 8192, // High-fidelity blueprints need more tokens
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(300000), // Extend to 5 minutes for complex analysis
    });

    if (!response.ok) {
      const errorText = await response.ok ? "" : await response.text();
      throw new Error(`${selected.label} Error (${response.status}): ${errorText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const isResponseStreaming = contentType.includes("text/event-stream") || isStream;

    if (isResponseStreaming && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      const parser = createParser({
        onEvent: (event) => {
          if (event.type === "event") {
            if (event.data === "[DONE]") return;
            try {
              const json = JSON.parse(event.data);
              const content = json.choices[0]?.delta?.content || "";
              if (content) {
                outputText += content;
                onChunk(content);
              }
            } catch {}
          }
        }
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.feed(decoder.decode(value, { stream: true }));
      }
    } else {
      // Fallback to regular JSON handling
      const data = await response.json();
      outputText = extractChatCompletionText(data);
      if (onChunk) onChunk(outputText);
    }
  }

  return {
    provider: selected.provider,
    model: selected.model,
    text: outputText,
  };
}

app.get("/api/health", (_req, res) => {
  configManager.injectIntoProcessEnv(); // Reload persistent config
  dotenv.config({ override: true }); // Then reload .env overrides
  const providers = getProviderCatalog();
  res.json({
    ok: true,
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    hasGitHubToken: Boolean(process.env.GITHUB_TOKEN),
    defaultProvider: process.env.DEFAULT_PROVIDER || "openai",
    providers,
  });
});

app.get("/api/github/inspect", async (req, res) => {
  try {
    const url = req.query.url;
    const githubContext = await inspectTarget(url);
    res.json(githubContext);
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
});

app.post("/api/analyze/stream", async (req, res) => {
    const payload = req.body || {};
    const shouldStream = payload.stream !== false;

    if (shouldStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        try {
            if (!payload.githubContext) {
                res.write(`data: ${JSON.stringify({ error: "ต้องส่ง githubContext มาด้วย" })}\n\n`);
                return res.end();
            }

            await analyzeWithProvider(payload, (chunk) => {
                res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
            });

            res.write(`data: [DONE]\n\n`);
            res.end();
        } catch (error) {
            res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
            res.end();
        }
    } else {
        // Non-streaming mode
        try {
            if (!payload.githubContext) {
                return res.status(400).json({ error: "ต้องส่ง githubContext มาด้วย" });
            }

            const result = await analyzeWithProvider({ ...payload, stream: false });
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
});

app.post("/api/agent/stream", async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
        const payload = req.body || {};
        
        // Grab the exact provider they set as default!
        const targetProvider = process.env.DEFAULT_PROVIDER || "kilocode";
        const selected = resolveProvider(targetProvider);
        const apiKey = process.env[`${selected.provider.toUpperCase()}_API_KEY`];
        const baseUrl = selected.baseUrl || "https://api.openai.com/v1";
        
        // Boot up Sandbox with custom provider!
        const agent = new SandboxAgent(apiKey, baseUrl, selected.model);
        
        await agent.run(
            payload.url,
            (logMsg) => {
                res.write(`data: ${JSON.stringify({ log: logMsg })}\n\n`);
                if (res.flush) res.flush(); // Force express-compression or similar to send data immediately
            },
            (content) => {
                res.write(`data: ${JSON.stringify({ chunk: content })}\n\n`);
                if (res.flush) res.flush();
          },
          (draftUpdate) => {
            res.write(`data: ${JSON.stringify({ draft: draftUpdate })}\n\n`);
            if (res.flush) res.flush();
            }
        );
        res.write(`data: [DONE]\n\n`);
        res.end();
    } catch (error) {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

app.listen(PORT, () => {
  console.log(`Reverse Engineer app running at http://localhost:${PORT}`);
});
