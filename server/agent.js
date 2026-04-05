const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files and directories in a given path. Use '.' for root.",
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
      description: "Read the full contents of a file to understand its logic.",
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
      name: "grep_search",
      description: "Search for a specific string or function call across all files using git grep. Useful for finding where functions are used.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"]
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

  async run(url, onLog, onChunk) {
    if (!this.apiKey) {
       onLog("[Error] API_KEY not found. Please configure the API Key for your selected provider.");
       return;
    }
    
    // 1. Setup Sandbox Directory
    const outputDir = path.join(__dirname, "..", "output");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    
    // Give it a safe hash-like name
    const repoName = url.split("/").pop() || "repo";
    const cloneDir = path.join(outputDir, `sandbox_${repoName}_${Date.now()}`);
    
    try {
      onLog(`[Init] Cloning ${url} to local sandbox...`);
      execSync(`git clone --depth 1 "${url}" "${cloneDir}"`, { stdio: "ignore" });
    } catch(e) {
      // Sometimes git clone on Windows returns non-zero exit code (e.g., LFS issues or strict path warnings)
      // but actually finishes cloning successfully. We check if .git exists to be sure.
      if (!fs.existsSync(path.join(cloneDir, ".git"))) {
        onLog(`[Error] Failed to clone repo: ${e.message}`);
        return;
      }
      onLog(`[Warn] Git clone threw a warning, but codebase seems intact. Proceeding...`);
    }

    onLog(`[Setup] Sandbox Activated at ${path.basename(cloneDir)}`);

    // 2. Initialize Agent Memory
    this.messages.push({
      role: "system",
      content: `You are an autonomous AI Architecture Sandbox.
Your objective: Deeply analyze the local repository and generate the ULTIMATE Blueprint System Prompt.
The codebase is currently in your working directory. You have full freedom.
RULES:
1. Start by listing the root directory using 'list_dir'.
2. Identify core configuration files (e.g., package.json, docker-compose, tsconfig, main.js) and read them.
3. Don't blindly read everything, use 'grep_search' if you want to trace where a variable or component is used.
4. Stop using tools once you grasp the full architectural flow.
5. When done, reply back with the ultimate System Prompt / Documentation. DO NOT call anymore tools. Just output the final mega-prompt. Focus purely on generating the prompt.`
    });
    
    this.messages.push({ 
      role: "user", 
      content: `Please enter the sandbox and examine the codebase at root. Once done, give me the final Prompt.` 
    });

    onLog(`[Engine] Agent Engine Started. Initializing AI loop...`);

    let done = false;
    let turnCount = 0;
    const MAX_TURNS = 15; // Prevent infinite loops

    while (!done && turnCount < MAX_TURNS) {
      turnCount++;
      
      const endpoint = this.baseUrl.endsWith("/chat/completions") ? this.baseUrl : `${this.baseUrl}/chat/completions`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: this.messages,
          tools: TOOLS,
          temperature: 0.2
        })
      });

      if (!response.ok) {
        const errObj = await response.text();
        onLog(`[Error] API Error: ${errObj}`);
        break;
      }

      const data = await response.json();
      const choice = data.choices[0];
      const message = choice.message;

      this.messages.push(message);

      // Condition A: Agent decides to use tools
      if (message.tool_calls && message.tool_calls.length > 0) {
        for (const call of message.tool_calls) {
          const name = call.function.name;
          const args = JSON.parse(call.function.arguments);
          onLog(`[Agent] Processing... Using tool: ${name} (${JSON.stringify(args)})`);
          
          let result = "";
          try {
             if (name === "list_dir") {
                 let safePath = path.resolve(cloneDir, args.dirPath || ".");
                 if (!safePath.startsWith(cloneDir)) safePath = cloneDir;
                 if (fs.existsSync(safePath)) {
                    result = fs.readdirSync(safePath, { withFileTypes: true })
                      .map(f => `${f.isDirectory() ? "[DIR]" : "[FILE]"} ${f.name}`).join("\n");
                 } else result = "Folder not found.";
             } else if (name === "read_file") {
                 let safePath = path.resolve(cloneDir, args.filePath);
                 if (!safePath.startsWith(cloneDir)) safePath = cloneDir;
                 if (fs.existsSync(safePath)) {
                    result = fs.readFileSync(safePath, "utf-8").slice(0, 10000); // truncated slightly to prevent token explosion
                 } else result = "File not found.";
             } else if (name === "grep_search") {
                 // Use git grep to stay fast and ignore node_modules natively
                 const output = execSync(`git grep -ni "${args.query}"`, { cwd: cloneDir, encoding: "utf-8" });
                 result = output.slice(0, 5000);
             }
          } catch(e) {
             // In git grep, exit code 1 means no match
             result = e.message.includes("Command failed") ? "No matches found." : `Tool error: ${e.message}`;
          }

          this.messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: name,
            content: result
          });
        }
      } 
      // Condition B: Agent is done and outputs text
      else if (message.content) {
        onLog(`[Agent] Finished exploring codebase. Streaming final prompt...`);
        onChunk(message.content);
        done = true;
      }
    }

    if (turnCount >= MAX_TURNS) {
      onLog(`[Warn] Safety Trigger: Max turns (${MAX_TURNS}) reached to prevent infinite loop.`);
    }

    // Cleanup Sandbox (optional, but good practice so we don't clog up space)
    try {
      // Remove sync logic
      execSync(process.platform === "win32" ? `rmdir /s /q "${cloneDir}"` : `rm -rf "${cloneDir}"`, { stdio: 'ignore' });
      onLog(`[Cleanup] Sandbox environment cleaned up.`);
    } catch(e) {}
  }
}

module.exports = { SandboxAgent };
