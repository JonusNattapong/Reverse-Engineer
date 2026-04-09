// DOM Elements
const repoUrlInput = document.getElementById("repo-url");
const providerInput = document.getElementById("provider");
const modelInput = document.getElementById("model");
const outputStyleInput = document.getElementById("output-style");
const languageInput = document.getElementById("language");
const goalInput = document.getElementById("goal");
const extraContextInput = document.getElementById("extra-context");
const analyzeBtn = document.getElementById("analyze-btn");
const agentBtn = document.getElementById("agent-btn");
const statusLog = document.getElementById("status-log");
const exportDropdown = document.getElementById("export-dropdown");
const serverStatusCell = document.getElementById("server-health");

const metaRepo = document.getElementById("meta-repo");
const metaBranch = document.getElementById("meta-branch");
const metaType = document.getElementById("meta-type");
const metaPath = document.getElementById("meta-path");

const contextOutput = document.getElementById("context-output");
const draftOutput = document.getElementById("draft-output");
const draftStatus = document.getElementById("draft-status");
const analysisOutput = document.getElementById("analysis-output");

const copyMetaBtn = document.getElementById("copy-meta-btn");
const copyContextBtn = document.getElementById("copy-context-btn");
const copyDraftBtn = document.getElementById("copy-draft-btn");
const copyAnalysisBtn = document.getElementById("copy-analysis-btn");

// Initialization
async function init() {
  await checkHealth();
  // Check health every 30s
  setInterval(checkHealth, 30000);
}

async function checkHealth() {
  try {
    const health = await fetchJson("/api/health");
    serverStatusCell.classList.add("online");
    serverStatusCell.querySelector(".status-text").textContent = "Server Online";
    
    // Fill providers if empty
    if (providerInput.options.length === 0) {
      Object.entries(health.providers || {}).forEach(([id, p]) => {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = `${p.label} ${p.configured ? " (Ready)" : " (Not Configured)"}`;
        if (id === health.defaultProvider) opt.selected = true;
        providerInput.appendChild(opt);
      });
    }
  } catch (error) {
    serverStatusCell.classList.remove("online");
    serverStatusCell.querySelector(".status-text").textContent = "Offline/Error";
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Server Error: ${response.status}`);
  return data;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function addLog(message, type = "system") {
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="log-time">[${new Date().toLocaleTimeString()}]</span> ${escapeHtml(message)}`;
  statusLog.prepend(entry);
}

function renderMarkdownOutput(element, text) {
  element.dataset.raw = text;
  element.innerHTML = marked.parse(text || "");
  const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
  if (isNearBottom) {
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }
}

function setDraftStatus(label, state = "") {
  if (!draftStatus) return;
  draftStatus.textContent = label;
  draftStatus.className = "draft-status";
  if (state) {
    draftStatus.classList.add(state);
  }
}

function resetOutputs() {
  analysisOutput.innerHTML = '<p class="placeholder-text">Waiting for AI synthesis...</p>';
  analysisOutput.dataset.raw = "";
  draftOutput.value = "";
  draftOutput.dataset.raw = "";
  if (exportDropdown) {
    exportDropdown.classList.remove("visible");
  }
  setDraftStatus("Idle");
}

function setBusyState(isBusy, modeLabel) {
  analyzeBtn.disabled = isBusy;
  agentBtn.disabled = isBusy;
  analyzeBtn.querySelector(".btn-text").textContent = isBusy ? `Running ${modeLabel}...` : "Execute Deep Analysis";
  agentBtn.querySelector(".btn-text").textContent = isBusy ? `Running ${modeLabel}...` : "Run Agent Sandbox";
}

async function analyzeGitHubContext(githubContext) {
  const provider = providerInput.value;
  addLog(`Requesting synthesis from ${provider} (STREAMING)...`, "loading");
  resetOutputs();

  try {
    const response = await fetch("/api/analyze/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        githubContext,
        goal: goalInput.value.trim(),
        outputStyle: outputStyleInput.value,
        language: languageInput.value,
        provider: provider,
        model: modelInput.value.trim(),
        extraContext: extraContextInput.value.trim(),
      }),
    });

    if (!response.ok) throw new Error(`Stream connection failed: ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // Keep partial line

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ")) {
          const dataStr = trimmed.replace("data: ", "").trim();
          if (dataStr === "[DONE]") {
            addLog(`Synthesis finalized`, "success");
            if (exportDropdown) exportDropdown.classList.add("visible");
            continue;
          }

          try {
            const data = JSON.parse(dataStr);
            if (data.error) throw new Error(data.error);
            if (data.chunk) {
              fullText += data.chunk;
              renderMarkdownOutput(analysisOutput, fullText);
            }
          } catch (e) {
            if (dataStr !== "[DONE]") console.error("Parse error", e);
          }
        }
      }
    }
  } catch (error) {
    addLog(`Streaming Error: ${error.message}`, "error");
    throw error;
  }
}

async function runAgentSandbox(targetUrl) {
  addLog(`Starting autonomous agent sandbox for ${targetUrl}...`, "loading");
  resetOutputs();
  setDraftStatus("Booting", "reset");

  const response = await fetch("/api/agent/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: targetUrl }),
  });

  if (!response.ok) {
    throw new Error(`Agent stream failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;

      const dataStr = trimmed.replace("data: ", "").trim();
      if (dataStr === "[DONE]") {
        addLog("Agent sandbox completed", "success");
        if (exportDropdown) exportDropdown.classList.add("visible");
        continue;
      }

      const data = JSON.parse(dataStr);
      if (data.error) {
        throw new Error(data.error);
      }

      if (data.log) {
        addLog(data.log, "system");
      }

      if (data.draft) {
        draftOutput.value = data.draft.content || "";
        draftOutput.dataset.raw = data.draft.content || "";
        draftOutput.scrollTop = draftOutput.scrollHeight;

        const statusLabel = data.draft.action
          ? `${data.draft.action.toUpperCase()} ${data.draft.deltaLength || data.draft.newLength || ""}`.trim()
          : "Updating";
        setDraftStatus(statusLabel, data.draft.action || "");

        if (data.draft.action === "append") {
          addLog(`Draft append: ${data.draft.deltaLength || 0} chars`, "success");
        } else if (data.draft.action === "replace") {
          addLog(`Draft replace: ${data.draft.oldLength || 0} -> ${data.draft.newLength || 0} chars`, "success");
        } else if (data.draft.action === "finalize") {
          addLog("Draft finalized and synchronized", "success");
        }

        if (data.draft.note) {
          addLog(data.draft.note, "system");
        }
      }

      if (data.chunk) {
        finalText += data.chunk;
        renderMarkdownOutput(analysisOutput, finalText);
      }
    }
  }

  if (!finalText && draftOutput.dataset.raw) {
    renderMarkdownOutput(analysisOutput, draftOutput.dataset.raw);
  }
}

let isAnalyzing = false;

async function analyze(mode = "standard") {
  if (isAnalyzing) return;

  const url = repoUrlInput.value.trim();
  if (!url) {
    addLog("Error: Repository URL is required", "error");
    return;
  }

  isAnalyzing = true;
  setBusyState(true, mode === "agent" ? "Agent Sandbox" : "Deep Analysis");
  addLog(`Initiating data extraction for ${url}...`, "loading");

  try {
    const githubContext = await fetchJson(`/api/github/inspect?url=${encodeURIComponent(url)}`);
    addLog("Data extraction from GitHub successful", "success");
    
    // Update metadata
    const meta = githubContext.metadata;
    metaRepo.textContent = `${meta.owner}/${meta.repo}`;
    metaBranch.textContent = meta.branch;
    metaType.textContent = meta.type;
    metaPath.textContent = meta.path;

    // Update context tree/file
    let contextText = `TARGET: ${meta.url}\n\n`;
    if (githubContext.file) {
      contextText += `--- FILE CONTENT: ${githubContext.file.path} ---\n${githubContext.file.content}\n\n`;
    }
    contextText += "--- REPOSITORY TREE ---\n";
    githubContext.tree.forEach(item => {
      contextText += `[${item.type === 'tree' ? 'DIR ' : 'FILE'}] ${item.path}${item.size ? ` (${item.size} bytes)` : ''}\n`;
    });
    contextOutput.value = contextText;

    if (mode === "agent") {
      await runAgentSandbox(url);
    } else {
      await analyzeGitHubContext(githubContext);
    }

  } catch (error) {
    addLog(`Error: ${error.message}`, "error");
  } finally {
    isAnalyzing = false;
    setBusyState(false, mode === "agent" ? "Agent Sandbox" : "Deep Analysis");
  }
}

// Visual Copy Action — Modern Clipboard API with fallback
async function copyText(text, btn) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for non-HTTPS / older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    const originalIcon = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i>';
    btn.classList.add("success");
    setTimeout(() => {
      btn.innerHTML = originalIcon;
      btn.classList.remove("success");
    }, 1500);
  } catch (err) {
    console.error("Copy failed", err);
    addLog("Copy failed — try using the download option instead", "error");
  }
}

// Download/Export Functions
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  addLog(`Exported: ${filename}`, "success");
}

function getExportBaseName() {
  const repo = metaRepo.textContent.trim().replace(/\//g, "-");
  return repo && repo !== "-" ? repo : "reverse-engineer";
}

function buildMarkdownExport() {
  const raw = analysisOutput.dataset.raw || "";
  const meta = `---\n# Reverse Engineer — Analysis Export\n# Repo: ${metaRepo.textContent}\n# Branch: ${metaBranch.textContent}\n# Type: ${metaType.textContent}\n# Path: ${metaPath.textContent}\n# Date: ${new Date().toISOString()}\n---\n\n`;
  return meta + raw;
}

function buildJsonExport() {
  return JSON.stringify({
    meta: {
      repo: metaRepo.textContent,
      branch: metaBranch.textContent,
      type: metaType.textContent,
      path: metaPath.textContent,
      exportedAt: new Date().toISOString(),
    },
    context: contextOutput.value,
    analysis: analysisOutput.dataset.raw || "",
  }, null, 2);
}

function buildHtmlExport() {
  const raw = analysisOutput.dataset.raw || "";
  const rendered = marked.parse(raw);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Analysis — ${metaRepo.textContent}</title>
  <style>
    :root { --bg: #080a0f; --card: #10121b; --cyan: #00f2ff; --text: #f3f4f6; --dim: #9ca3af; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', Inter, system-ui, sans-serif; line-height: 1.7; padding: 2rem; }
    .container { max-width: 900px; margin: 0 auto; }
    header { border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem; margin-bottom: 2rem; }
    header h1 { color: var(--cyan); font-size: 1.4rem; letter-spacing: 2px; }
    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap: 0.5rem; margin-bottom: 2rem; padding: 1rem; background: var(--card); border-radius: 0.75rem; border: 1px solid rgba(255,255,255,0.08); }
    .meta span { font-size: 0.8rem; color: var(--dim); }
    .meta strong { color: var(--cyan); font-size: 0.9rem; }
    article h1,article h2,article h3 { color: var(--cyan); margin-top: 1.5rem; margin-bottom: 0.75rem; border-bottom: 1px solid rgba(0,242,255,0.1); padding-bottom: 0.4rem; }
    article p { margin-bottom: 1rem; }
    article strong { color: #ff00ff; }
    article code { background: rgba(255,255,255,0.1); padding: 0.15rem 0.4rem; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 0.85em; color: var(--cyan); }
    article pre { background: #0d1117; padding: 1rem; border-radius: 8px; overflow-x: auto; margin: 1rem 0; border: 1px solid rgba(255,255,255,0.08); }
    article pre code { background: none; padding: 0; color: #e6edf3; }
    article ul,article ol { margin-left: 1.5rem; margin-bottom: 1rem; }
    article li { margin-bottom: 0.4rem; }
    footer { margin-top: 3rem; text-align: center; color: var(--dim); font-size: 0.75rem; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <header><h1>REVERSE ENGINEER — Analysis Export</h1></header>
    <div class="meta">
      <div><span>Repo</span><br><strong>${metaRepo.textContent}</strong></div>
      <div><span>Branch</span><br><strong>${metaBranch.textContent}</strong></div>
      <div><span>Type</span><br><strong>${metaType.textContent}</strong></div>
      <div><span>Path</span><br><strong>${metaPath.textContent}</strong></div>
    </div>
    <article>${rendered}</article>
    <footer>&copy; ${new Date().getFullYear()} Reverse Engineer — Exported ${new Date().toLocaleString()}</footer>
  </div>
</body>
</html>`;
}

function exportAs(format) {
  const baseName = getExportBaseName();
  const raw = analysisOutput.dataset.raw || "";

  if (!raw) {
    addLog("Nothing to export — run an analysis first", "error");
    return;
  }

  switch (format) {
    case "md":
      downloadFile(buildMarkdownExport(), `${baseName}-analysis.md`, "text/markdown;charset=utf-8");
      break;
    case "txt":
      downloadFile(raw, `${baseName}-analysis.txt`, "text/plain;charset=utf-8");
      break;
    case "json":
      downloadFile(buildJsonExport(), `${baseName}-analysis.json`, "application/json;charset=utf-8");
      break;
    case "html":
      downloadFile(buildHtmlExport(), `${baseName}-analysis.html`, "text/html;charset=utf-8");
      break;
  }
}

// Toggle export dropdown
function toggleExportMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById("export-menu");
  menu.classList.toggle("open");
}

// Close menu on outside click
document.addEventListener("click", () => {
  const menu = document.getElementById("export-menu");
  if (menu) menu.classList.remove("open");
});

// Listeners
analyzeBtn.addEventListener("click", () => analyze("standard"));
agentBtn.addEventListener("click", () => analyze("agent"));

repoUrlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") analyze("standard");
});

copyContextBtn.addEventListener("click", () => copyText(contextOutput.value, copyContextBtn));
copyDraftBtn.addEventListener("click", () => copyText(draftOutput.dataset.raw || draftOutput.value || "", copyDraftBtn));
copyAnalysisBtn.addEventListener("click", () => copyText(analysisOutput.dataset.raw || "", copyAnalysisBtn));
copyMetaBtn.addEventListener("click", () => {
  const text = `Repo: ${metaRepo.textContent}\nBranch: ${metaBranch.textContent}\nType: ${metaType.textContent}\nPath: ${metaPath.textContent}`;
  copyText(text, copyMetaBtn);
});

// Export button listeners
document.getElementById("export-toggle")?.addEventListener("click", toggleExportMenu);
document.getElementById("export-md")?.addEventListener("click", () => exportAs("md"));
document.getElementById("export-txt")?.addEventListener("click", () => exportAs("txt"));
document.getElementById("export-json")?.addEventListener("click", () => exportAs("json"));
document.getElementById("export-html")?.addEventListener("click", () => exportAs("html"));

// Run
init();
