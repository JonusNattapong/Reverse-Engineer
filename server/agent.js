const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const simpleGit = require("simple-git");
const promptManager = require("../lib/promptManager");
const axios = require("axios");
const cheerio = require("cheerio");
const TurndownService = require("turndown");
const { chromium } = require("playwright");
const beautify = require("js-beautify").js;
const turndown = new TurndownService();
const RESULT_DRAFT_FILENAME = "ANALYSIS_RESULT_DRAFT.md";
const BLUEPRINT_PROMPT_FILENAME = "BLUEPRINT_PROMPT.md";
const LEGACY_BLUEPRINT_FILENAME = "SYSTEM_BLUEPRINT.md";
const DRAFT_REREAD_INTERVAL = 4;

function buildDraftTemplate(target, mode) {
  return [
    `# Analysis Draft`,
    ``,
    `## Target`,
    `- Input: ${target}`,
    `- Mode: ${mode}`,
    `- Status: In Progress`,
    ``,
    `## Architecture`,
    `### Facts`,
    `- Pending evidence collection.`,
    ``,
    `### Hypotheses`,
    `- None yet.`,
    ``,
    `## Data Flow`,
    `### Facts`,
    `- Pending evidence collection.`,
    ``,
    `### Hypotheses`,
    `- None yet.`,
    ``,
    `## Key Files`,
    `### Facts`,
    `- Pending evidence collection.`,
    ``,
    `### Hypotheses`,
    `- None yet.`,
    ``,
    `## Open Questions`,
    `- What is still unclear?`,
    ``,
    `## Gaps To Investigate Next`,
    `- Add the next concrete inspection targets here.`,
    ``,
    `## Final Synthesis`,
    `### Facts`,
    `- Not ready.`,
    ``,
    `### Hypotheses`,
    `- Not ready.`,
    ``,
  ].join("\n");
}

function buildCheckpointPrompt(draftContent) {
  return [
    `CHECKPOINT REREAD REQUIRED.`,
    `Read the current draft below as working memory before you continue.`,
    `1. Identify weak sections or placeholders that still lack evidence.`,
    `2. Update 'Gaps To Investigate Next' with the next concrete inspection targets.`,
    `3. Keep Facts and Hypotheses separate. Facts require direct evidence from files, commands, or rendered output.`,
    `4. Do not continue blind exploration until the draft reflects what is known vs uncertain.`,
    ``,
    `CURRENT DRAFT:`,
    draftContent,
  ].join("\n");
}

function buildBlueprintSynthesisPrompt(draftContent, target, mode) {
  return [
    `FINAL ROUND. Convert the analysis draft into a prompt-ready blueprint.`,
    `Do NOT return the draft verbatim. Rewrite it into a polished system recreation prompt for another coding model.`,
    `Target: ${target}`,
    `Mode: ${mode}`,
    ``,
    `OUTPUT REQUIREMENTS:`,
    `1. Start exactly with: 'Act as an expert developer. Based on the following system specification...'`,
    `2. Output a single prompt-ready blueprint artifact, not notes, not commentary, not a changelog.`,
    `3. Use the draft as source material, but remove draft markers like 'Facts', 'Hypotheses', 'Open Questions' unless they are rewritten into polished sections.`,
    `4. Preserve uncertainty honestly: if something remains uncertain, label it as hypothesis or missing context within the blueprint.`,
    `5. Include architecture, data flow, key files/components, integration points, constraints, and an implementation plan.`,
    `6. Optimize for another coding model to recreate the system with high fidelity.`,
    ``,
    `SOURCE DRAFT:`,
    draftContent,
  ].join("\n");
}

function markDraftComplete(draftContent) {
  return String(draftContent || "").replace("- Status: In Progress", "- Status: Complete");
}

function readResultDraft(resultPath) {
  if (!fs.existsSync(resultPath)) {
    return "";
  }

  return fs.readFileSync(resultPath, "utf8");
}

function previewText(text, limit = 4000) {
  if (!text) {
    return "";
  }

  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit)}\n\n...[truncated ${text.length - limit} chars]`;
}

function writeResultDraft(resultPath, content, mode = "append") {
  const nextContent = mode === "replace"
    ? String(content || "")
    : `${readResultDraft(resultPath)}${content || ""}`;

  fs.writeFileSync(resultPath, nextContent, "utf8");
  return nextContent;
}

function replaceInResultDraft(resultPath, oldText, newText) {
  const current = readResultDraft(resultPath);
  const source = String(oldText || "");

  if (!source) {
    throw new Error("oldText is required");
  }

  const firstIndex = current.indexOf(source);
  if (firstIndex === -1) {
    throw new Error("Target text not found in result draft");
  }

  if (current.indexOf(source, firstIndex + source.length) !== -1) {
    throw new Error("Target text appears multiple times. Read the draft and replace with a more specific block.");
  }

  const nextContent = current.replace(source, String(newText || ""));
  fs.writeFileSync(resultPath, nextContent, "utf8");
  return nextContent;
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files (Repo Mode only).",
      parameters: {
        type: "object",
        properties: { dirPath: { type: "string" } },
        required: ["dirPath"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a local file or JS source. Auto-beautifies if it's JS.",
      parameters: {
        type: "object",
        properties: { filePath: { type: "string" } },
        required: ["filePath"]
      }
    }
  },
  {
     type: "function",
     function: {
        name: "fetch_url",
        description: "Visit a URL with a browser (Playwright). Extracts DOM, Metadata, and Network API traffic (XHR/Fetch).",
        parameters: {
          type: "object",
          properties: { 
            url: { type: "string" },
            wait: { type: "boolean", description: "Wait for network idle (recommended for SPAs like React/Vue)." }
          },
          required: ["url"]
        }
     }
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Execute a shell command (Local Mode only).",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_result",
      description: "Read the accumulated analysis result draft. Use this before editing existing sections.",
      parameters: {
        type: "object",
        properties: {},
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_result",
      description: "Write analysis findings into the accumulated result draft. Use append for new notes and replace to rewrite the whole draft.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" },
          mode: { type: "string", enum: ["append", "replace"] }
        },
        required: ["content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "replace_result",
      description: "Replace a specific unique block inside the accumulated result draft.",
      parameters: {
        type: "object",
        properties: {
          oldText: { type: "string" },
          newText: { type: "string" }
        },
        required: ["oldText", "newText"]
      }
    }
  }
];

class SandboxAgent {
  constructor(apiKey, baseUrl, model = "gpt-4o") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || "https://api.openai.com/v1";
    this.model = model;
    this.messages = [];
  }

  async run(url, onLog, onChunk, onDraftUpdate) {
    const debugLog = (msg) => {
        try {
            const logLine = `[${new Date().toISOString()}] ${msg}\n`;
            fs.appendFileSync(path.join(process.cwd(), "agent_debug.log"), logLine);
            onLog(msg);
        } catch(e) {
            onLog(`[Logger Error] ${e.message}`);
        }
    };

    try {
      if (!this.apiKey) {
         debugLog("[Error] API_KEY not found.");
         return;
      }
      
      debugLog("[System] Initializing Hybrid Browser-Enhanced Agent...");
      
      const configManager = require("../lib/configManager");
      const workspaceRoot = configManager.getDefaultWorkspace();
      
      let cloneDir = "";
      let mode = "repo"; 

      if (!url.startsWith("http") && fs.existsSync(url)) {
        cloneDir = path.resolve(url);
        debugLog(`[Setup] Local Mode: ${cloneDir}`);
      } else if (url.includes("github.com")) {
        const parts = url.split("/").filter(Boolean);
        const repo = parts.pop() || "repo";
        const owner = parts.pop() || "owner";
        const ownerDir = path.join(workspaceRoot, owner);
        if (!fs.existsSync(ownerDir)) fs.mkdirSync(ownerDir, { recursive: true });
        cloneDir = path.join(ownerDir, repo);
        const git = simpleGit();
        if (fs.existsSync(cloneDir)) {
          debugLog(`[Setup] Syncing Repo...`);
          try { await git.cwd(cloneDir).pull(); } catch(e) { debugLog(`[Warn] Sync failed.`); }
        } else {
          debugLog(`[Init] Cloning Repo...`);
          await git.clone(url, cloneDir, ["--depth", "1"]);
        }
      } else {
        mode = "web";
        debugLog(`[Setup] Hybrid Web Mode: ${url}`);
        const host = new URL(url).hostname;
        cloneDir = path.join(workspaceRoot, "web_scans", host);
        if (!fs.existsSync(cloneDir)) fs.mkdirSync(cloneDir, { recursive: true });
      }

      const blueprintPath = path.join(cloneDir, BLUEPRINT_PROMPT_FILENAME);
      const legacyBlueprintPath = path.join(cloneDir, LEGACY_BLUEPRINT_FILENAME);
      const resultDraftPath = path.join(cloneDir, RESULT_DRAFT_FILENAME);
      const initialDraft = buildDraftTemplate(url, mode.toUpperCase());
      fs.writeFileSync(resultDraftPath, initialDraft, "utf8");
      const emitDraftUpdate = (action, content, extra = {}) => {
        if (typeof onDraftUpdate !== "function") {
          return;
        }

        onDraftUpdate({
          action,
          content,
          preview: previewText(content, 1200),
          path: resultDraftPath,
          updatedAt: new Date().toISOString(),
          ...extra,
        });
      };

      emitDraftUpdate("reset", initialDraft, { note: "Draft initialized from structured template" });
      let existingKnowledge = "";
      const existingBlueprintPath = fs.existsSync(blueprintPath)
        ? blueprintPath
        : fs.existsSync(legacyBlueprintPath)
        ? legacyBlueprintPath
        : null;
      if (existingBlueprintPath) {
          try {
              const blueprint = fs.readFileSync(existingBlueprintPath, "utf8");
              existingKnowledge = `\n\n### PREVIOUS ARCHITECTURAL KNOWLEDGE:\n${blueprint}\n\n`;
          } catch(e) {}
      }
      debugLog(`[Memory] Result draft initialized: ${resultDraftPath}`);

      this.messages.push({
        role: "system",
        content: promptManager.getPrompt("agent") + existingKnowledge + `\n\nENVIRONMENT: ${mode.toUpperCase()}. You are an expert code architect. If Web Mode is active, focus on discovering API endpoints, React bundle logic, and rendering patterns.\nRESULT DRAFT FILE: ${RESULT_DRAFT_FILENAME}. Persist findings into it as you work; do not rely on memory alone.`
      });
      
      this.messages.push({ role: "user", content: `Target: ${url}. Begin deep analysis.` });

      debugLog(`[Engine] Agent Started. Mode: ${mode.toUpperCase()}...`);

      let done = false;
      let turnCount = 0;
      const MAX_TURNS = 25;
      let toolCallingSupported = true;

      while (!done && turnCount < MAX_TURNS) {
        turnCount++;
        const endpoint = this.baseUrl.endsWith("/chat/completions") ? this.baseUrl : `${this.baseUrl}/chat/completions`;
        if (turnCount > 1 && turnCount < MAX_TURNS && turnCount % DRAFT_REREAD_INTERVAL === 0) {
           const checkpointDraft = readResultDraft(resultDraftPath).trim() || initialDraft;
           this.messages.push({
             role: "user",
             content: buildCheckpointPrompt(checkpointDraft),
           });
           debugLog(`[Checkpoint] Draft reread injected at turn ${turnCount}.`);
        }
        
        if (turnCount === MAX_TURNS) {
           const draftSnapshot = markDraftComplete(readResultDraft(resultDraftPath).trim() || initialDraft);
           fs.writeFileSync(resultDraftPath, draftSnapshot, "utf8");
           emitDraftUpdate("finalize", draftSnapshot, { note: "Draft locked as complete before blueprint synthesis" });
           this.messages.push({
             role: "user",
             content: buildBlueprintSynthesisPrompt(draftSnapshot || "(empty)", url, mode.toUpperCase())
           });
        }

        const body = {
          model: this.model,
          messages: this.messages,
          temperature: 0.1
        };
        if (toolCallingSupported && turnCount < MAX_TURNS) body.tools = TOOLS;

        debugLog(`[Turn ${turnCount}] Requesting AI...`);
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.apiKey}` },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const errText = await response.text();
          if (response.status === 400 && toolCallingSupported) {
            toolCallingSupported = false;
            turnCount--;
            continue;
          }
          debugLog(`[Error] API ${response.status}: ${errText.slice(0, 300)}`);
          break;
        }

        const data = await response.json();
        const message = data.choices[0].message;
        this.messages.push(message);

        if (message.tool_calls && message.tool_calls.length > 0 && turnCount < MAX_TURNS) {
          debugLog(`[Agent] Calling ${message.tool_calls.length} tool(s)...`);
          for (const call of message.tool_calls) {
            const name = call.function.name;
            let args;
            try { args = typeof call.function.arguments === "string" ? JSON.parse(call.function.arguments) : call.function.arguments; } catch(e) { args = {}; }
            
            let result = "";
            try {
               if (name === "fetch_url") {
                   debugLog(`[Browser] Simulating user visit to: ${args.url}...`);
                   const browser = await chromium.launch({ headless: true });
                   const page = await browser.newPage();
                   
                   // Network Sniffer
                   const apiCalls = [];
                   page.on("request", req => {
                      const rUrl = req.url();
                      if (rUrl.includes("api") || rUrl.includes(".json") || rUrl.includes("graphql")) {
                         apiCalls.push(`${req.method()} ${rUrl}`);
                      }
                   });

                   try {
                     await page.goto(args.url, { waitUntil: args.wait ? "networkidle" : "domcontentloaded", timeout: 45000 });
                     
                     // Stack Detection (UI metadata based)
                     const meta = {
                        title: await page.title(),
                        scripts: await page.evaluate(() => Array.from(document.querySelectorAll("script[src]")).map(s => s.src)),
                        endpoints: apiCalls.slice(0, 20)
                     };
                     
                     const domContent = await page.content();
                     const md = turndown.turndown(domContent);
                     result = `BROWSER STATUS: OK\n\nMETADATA:\n${JSON.stringify(meta, null, 2)}\n\nRENDERED CONTENT:\n${md.slice(0, 6000)}`;
                     debugLog(`[Browser] Render complete. Found ${apiCalls.length} API calls.`);
                   } catch(e) { result = `Browser error: ${e.message}`; }
                   await browser.close();

               } else if (name === "list_dir" && mode === "repo") {
                   let safePath = path.resolve(cloneDir, args.dirPath || ".");
                   if (fs.existsSync(safePath)) {
                      const entries = fs.readdirSync(safePath);
                      result = entries.join("\n");
                      debugLog(`[Tool] <list_dir> ${args.dirPath}`);
                   } else result = "Not found.";
               } else if (name === "read_file") {
                  if (args.filePath.startsWith("http")) {
                      debugLog(`[Web] Reading & Beautifying Source: ${args.filePath}`);
                      const res = await axios.get(args.filePath);
                      // Auto-beautify if JS/JSON
                      if (args.filePath.includes(".js") || args.filePath.includes(".json")) {
                         result = beautify(res.data, { indent_size: 2, space_in_empty_paren: true });
                      } else {
                         result = res.data.slice(0, 15000);
                      }
                  } else {
                      let safePath = path.resolve(cloneDir, args.filePath);
                      if (fs.existsSync(safePath)) {
                          let content = fs.readFileSync(safePath, "utf-8");
                          if (args.filePath.endsWith(".js") || args.filePath.endsWith(".json")) {
                             content = beautify(content, { indent_size: 2 });
                          }
                          result = content.slice(0, 15000);
                          debugLog(`[Tool] <read_file> ${args.filePath}`);
                      } else result = "Not found.";
                  }
               } else if (name === "run_command" && mode === "repo") {
                   debugLog(`[Tool] <CMD> ${args.command}`);
                   result = execSync(args.command, { cwd: cloneDir, encoding: "utf-8", timeout: 45000 }).slice(0, 8000);
                 } else if (name === "read_result") {
                   result = readResultDraft(resultDraftPath) || "(empty result draft)";
                   debugLog(`[Tool] <read_result>`);
                 } else if (name === "write_result") {
                   const writeMode = args.mode === "replace" ? "replace" : "append";
                   const nextContent = writeResultDraft(resultDraftPath, args.content || "", writeMode);
                   result = `Result draft updated with mode=${writeMode}.\n\n${previewText(nextContent)}`;
                   debugLog(`[Tool] <write_result:${writeMode}> ${(args.content || "").length} chars`);
                     emitDraftUpdate(writeMode, nextContent, {
                       delta: previewText(String(args.content || ""), 500),
                       deltaLength: String(args.content || "").length,
                     });
                 } else if (name === "replace_result") {
                   const nextContent = replaceInResultDraft(resultDraftPath, args.oldText, args.newText);
                   result = `Result draft replaced successfully.\n\n${previewText(nextContent)}`;
                   debugLog(`[Tool] <replace_result> ${String(args.oldText || "").length} -> ${String(args.newText || "").length} chars`);
                     emitDraftUpdate("replace", nextContent, {
                       oldPreview: previewText(String(args.oldText || ""), 300),
                       newPreview: previewText(String(args.newText || ""), 500),
                       oldLength: String(args.oldText || "").length,
                       newLength: String(args.newText || "").length,
                     });
               }
            } catch(e) {
               result = `Error: ${e.message}`;
               debugLog(`[Error] Tool failure.`);
            }
            this.messages.push({ role: "tool", tool_call_id: call.id, name: name, content: result });
          }
        } else if (message.content) {
          const resultDraft = readResultDraft(resultDraftPath).trim();
          const finalOutput = String(message.content || "").trim() || resultDraft;
          debugLog(`[Agent] Deep Synthesis complete.`);
          onChunk(finalOutput);
          try {
              const header = `<!-- REVERSE ENGINEER BLUEPRINT - WEB/APP MODE - ${new Date().toISOString()} -->\n\n`;
              fs.writeFileSync(blueprintPath, header + finalOutput, "utf8");
              emitDraftUpdate("finalize", resultDraft, {
                note: `Blueprint prompt written to ${BLUEPRINT_PROMPT_FILENAME}`,
                blueprintPath,
                blueprintPreview: previewText(finalOutput, 1200),
              });
          } catch(e) {}
          done = true;
        }
      }
      debugLog(`[Status] Finished.`);
    } catch(err) {
      debugLog(`[Fatal] Agent Panic: ${err.message}`);
    }
  }
}

module.exports = { SandboxAgent };
