const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
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
  const response = await fetch(url, options);

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

async function inspectGitHubUrl(url) {
  const parsed = parseGitHubUrl(url);
  const repoDetails = await getRepoDetails(parsed.owner, parsed.repo);
  const branch = parsed.branch || repoDetails.default_branch;
  const treeSha = await getBranchTreeSha(parsed.owner, parsed.repo, branch);
  const fullTree = await getTree(parsed.owner, parsed.repo, treeSha);

  const context = {
    metadata: {
      owner: parsed.owner,
      repo: parsed.repo,
      branch,
      type: parsed.type,
      path: parsed.path || "/",
      url: parsed.url,
      private: repoDetails.private,
      description: repoDetails.description || "",
      defaultBranch: repoDetails.default_branch,
    },
    tree: [],
    file: null,
  };

  if (parsed.type === "file") {
    context.file = await getFileContent(parsed.owner, parsed.repo, parsed.path, branch);
    const fileParent = path.dirname(parsed.path);
    context.tree = summarizeTreeItems(fullTree, fileParent === "." ? "" : fileParent);
    return context;
  }

  const prefix = parsed.type === "repository" ? "" : parsed.path;
  context.tree = summarizeTreeItems(fullTree, prefix);

  const readmeCandidate = fullTree.find((item) => item.path.toLowerCase() === "readme.md");

  if (readmeCandidate) {
    try {
      context.readme = await getFileContent(parsed.owner, parsed.repo, readmeCandidate.path, branch);
    } catch {
      context.readme = null;
    }
  }

  return context;
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
    ? `You are a Senior Software Architect and Technical Documentation Expert specializing in high-fidelity system recreation. 
       Your goal is to generate a COMPREHENSIVE IMPLEMENTATION BLUEPRINT based on the provided repository context.
       
       This blueprint must be structured so that a junior-to-mid-level developer AI can RECREATE the system with 95% accuracy.
       
       FOLLOW THESE STEPS IN YOUR OUTPUT:
       1. EXECUTIVE SUMMARY: High-level purpose and business/technical goals.
       2. ARCHITECTURAL OVERVIEW: Text-based description (or Mermaid-style) of component interactions and boundaries.
       3. CORE ENTITIES & DATA MODELS: Key data structures, state shapes, and API schemas.
       4. KEY FUNCTIONALITY & LOGIC FLOW: Step-by-step processing pipelines for critical features.
       5. TECHNICAL DECISIONS & PATTERNS: Observed design patterns (e.g., Singleton, Factory, MVC) and framework constraints.
       6. INTEGRATION & DEPENDENCIES: Critical external libraries, third-party APIs, and infrastructure needs.
       7. ACTIONABLE IMPLEMENTATION PLAN: A prioritized, step-by-step guide for a Coder AI to build this system from scratch.
       
       START YOUR RESPONSE IMMEDIATELY WITH: 'Act as an expert developer. Based on the following system specification...'`
    : `You are a senior software architect and reverse engineering assistant. Produce a: ${outputStyle || "summary"} in ${language || "Thai"}.`;

  return [
    baseInstruction,
    `Analyze/Summarize the following GitHub target:`,
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
      : `Please produce:
1. A concise overview of what this target does.
2. Key modules, dependencies, or layers connected to it.
3. Execution flow, inputs, outputs, and integration points.
4. Risks, assumptions, hidden coupling, or code smells.
5. What to inspect next for deeper reverse engineering.
6. Actionable suggestions for documentation or refactoring if relevant.`
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

async function analyzeWithProvider(payload) {
  const prompt = buildAnalysisPrompt(payload);
  const selected = resolveProvider(payload.provider, payload.model);
  let data;
  let outputText = "";

  if (selected.provider === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("ยังไม่ได้ตั้งค่า OPENAI_API_KEY");
    }

    data = await postJson("https://api.openai.com/v1/chat/completions", {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: {
        model: selected.model,
        messages: [
          {
            role: "system",
            content:
              "Answer clearly and practically. Be explicit about what is directly observed from the provided repository context versus what is inferred.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      },
    });

    outputText = extractChatCompletionText(data);
  } else if (selected.provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY");
    }

    data = await postJson("https://api.anthropic.com/v1/messages", {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: {
        model: selected.model,
        max_tokens: 2000,
        system:
          "Answer clearly and practically. Be explicit about what is directly observed from the provided repository context versus what is inferred.",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      },
    });

    outputText = extractAnthropicText(data);
  } else if (selected.provider === "gemini") {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("ยังไม่ได้ตั้งค่า GEMINI_API_KEY");
    }

    data = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selected.model)}:generateContent`,
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: {
          systemInstruction: {
            parts: [
              {
                text: "Answer clearly and practically. Be explicit about what is directly observed from the provided repository context versus what is inferred.",
              },
            ],
          },
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        },
      }
    );

    outputText = extractGeminiText(data);
  } else if (selected.provider === "ollama") {
    data = await postJson(`${selected.baseUrl}/api/chat`, {
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        model: selected.model,
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "Answer clearly and practically. Be explicit about what is directly observed from the provided repository context versus what is inferred.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      },
    });

    outputText = data.message?.content || "";
  } else {
    const providerSettings = {
      openrouter: {
        key: process.env.OPENROUTER_API_KEY,
        url: "https://openrouter.ai/api/v1/chat/completions",
        extraHeaders: {
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
          "X-Title": process.env.OPENROUTER_APP_NAME || "Reverse Engineer",
        },
      },
      groq: {
        key: process.env.GROQ_API_KEY,
        url: "https://api.groq.com/openai/v1/chat/completions",
      },
      xai: {
        key: process.env.XAI_API_KEY,
        url: "https://api.x.ai/v1/chat/completions",
      },
      mistral: {
        key: process.env.MISTRAL_API_KEY,
        url: "https://api.mistral.ai/v1/chat/completions",
      },
      kilocode: {
        key: process.env.KILOCODE_API_KEY,
        url: `${selected.baseUrl}/chat/completions`,
      },
    }[selected.provider];

    const envVarName = `${selected.provider.toUpperCase()}_API_KEY`;
    if (!providerSettings?.key) {
      throw new Error(`ยังไม่ได้ตั้งค่า ${envVarName}`);
    }

    data = await postJson(providerSettings.url, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerSettings.key}`,
        ...(providerSettings.extraHeaders || {}),
      },
      body: {
        model: selected.model,
        messages: [
          {
            role: "system",
            content:
              "Answer clearly and practically. Be explicit about what is directly observed from the provided repository context versus what is inferred.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      },
    });

    outputText = extractChatCompletionText(data);
  }

  outputText = outputText || "The model returned no text output for this request.";

  return {
    provider: selected.provider,
    model: data.model || selected.model,
    text: outputText,
    responseId: data.id || null,
  };
}

app.get("/api/health", (_req, res) => {
  dotenv.config({ override: true }); // Force reload env changes
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
    const githubContext = await inspectGitHubUrl(url);
    res.json(githubContext);
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
});

app.post("/api/analyze", async (req, res) => {
  try {
    dotenv.config({ override: true }); // Force reload env changes
    const { githubContext, goal, outputStyle, language, extraContext, provider, model } =
      req.body || {};

    if (!githubContext || !githubContext.metadata) {
      return res.status(400).json({ error: "ต้องส่ง githubContext มาด้วย" });
    }

    const analysis = await analyzeWithProvider({
      githubContext,
      goal,
      outputStyle,
      language,
      extraContext,
      provider,
      model,
    });

    return res.json(analysis);
  } catch (error) {
    return res.status(400).json({
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Reverse Engineer app running at http://localhost:${PORT}`);
});
