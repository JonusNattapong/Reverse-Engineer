// DOM Elements
const repoUrlInput = document.getElementById("repo-url");
const providerInput = document.getElementById("provider");
const modelInput = document.getElementById("model");
const outputStyleInput = document.getElementById("output-style");
const languageInput = document.getElementById("language");
const goalInput = document.getElementById("goal");
const extraContextInput = document.getElementById("extra-context");
const analyzeBtn = document.getElementById("analyze-btn");
const statusLog = document.getElementById("status-log");
const serverStatusCell = document.getElementById("server-health");

const metaRepo = document.getElementById("meta-repo");
const metaBranch = document.getElementById("meta-branch");
const metaType = document.getElementById("meta-type");
const metaPath = document.getElementById("meta-path");

const contextOutput = document.getElementById("context-output");
const analysisOutput = document.getElementById("analysis-output");

const copyMetaBtn = document.getElementById("copy-meta-btn");
const copyContextBtn = document.getElementById("copy-context-btn");
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

function addLog(message, type = "system") {
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="log-time">[${new Date().toLocaleTimeString()}]</span> ${message}`;
  statusLog.prepend(entry);
}

async function analyzeGitHubContext(githubContext) {
  const provider = providerInput.value;
  addLog(`Requesting synthesis from ${provider}...`, "loading");
  
  const analysis = await fetchJson("/api/analyze", {
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

  // Render markdown
  analysisOutput.innerHTML = marked.parse(analysis.text || "No analysis returned.");
  // Store raw text for copying
  analysisOutput.dataset.raw = analysis.text || "";
  
  addLog(`Synthesis finalized by ${analysis.provider} (${analysis.model})`, "success");
}

async function analyze() {
  const url = repoUrlInput.value.trim();
  if (!url) {
    addLog("Error: Repository URL is required", "error");
    return;
  }

  analyzeBtn.disabled = true;
  analyzeBtn.querySelector(".btn-text").textContent = "Analyzing...";
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

    // Proceed to AI analysis
    await analyzeGitHubContext(githubContext);

  } catch (error) {
    addLog(`Error: ${error.message}`, "error");
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.querySelector(".btn-text").textContent = "Execute Deep Analysis";
  }
}

// Visual Copy Action
async function copyText(text, btn) {
    try {
        const hidden = document.getElementById("hidden-copy");
        hidden.value = text;
        hidden.select();
        document.execCommand("copy");
        
        const originalIcon = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        btn.classList.add("success");
        setTimeout(() => {
            btn.innerHTML = originalIcon;
            btn.classList.remove("success");
        }, 1500);
    } catch (err) {
        console.error("Copy failed", err);
    }
}

// Listeners
analyzeBtn.addEventListener("click", analyze);

repoUrlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") analyze();
});

copyContextBtn.addEventListener("click", () => copyText(contextOutput.value, copyContextBtn));
copyAnalysisBtn.addEventListener("click", () => copyText(analysisOutput.dataset.raw || "", copyAnalysisBtn));
copyMetaBtn.addEventListener("click", () => {
    const text = `Repo: ${metaRepo.textContent}\nBranch: ${metaBranch.textContent}\nType: ${metaPath.textContent}`;
    copyText(text, copyMetaBtn);
});

// Run
init();
