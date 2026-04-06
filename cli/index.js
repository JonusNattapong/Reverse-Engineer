const chalk = require("chalk");
const boxen = require("boxen");
const gradient = require("gradient-string");
const ora = require("ora");
const inquirer = require("inquirer");
const figures = require("figures");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { stdin: input, stdout: output } = require("process");
const configManager = require("../lib/configManager");

// Load persistent config into process.env on startup
configManager.migrateFromDotEnv(path.join(__dirname, "..", ".env"));
configManager.injectIntoProcessEnv();

const DEFAULT_BASE_URL =
  process.env.REVERSE_ENGINEER_BASE_URL || "http://localhost:3000";
const DEFAULT_STYLE = "blueprint";
const DEFAULT_LANGUAGE = "Thai";
const DEFAULT_PROVIDER = process.env.DEFAULT_PROVIDER || "openai";
const DEFAULT_STREAMING = process.env.STREAMING_ENABLED !== "false";

function updateEnv(key, value) {
  // Save to persistent config (survives npx runs)
  configManager.set(key, value);
  // Also inject into current process
  process.env[key] = value;
}

const APP_NAME = "REVERSE ENGINEER CLI v1.0";
const LOGO_TEXT = `
██████╗ ███████╗██╗   ██╗███████╗██████╗ ███████╗███████╗
██╔══██╗██╔════╝██║   ██║██╔════╝██╔══██╗██╔════╝██╔════╝
██████╔╝█████╗  ██║   ██║█████╗  ██████╔╝███████╗█████╗  
██╔══██╗██╔══╝  ╚██╗ ██╔╝██╔══╝  ██╔══██╗╚════██║██╔══╝  
██║  ██║███████╗ ╚████╔╝ ███████╗██║  ██║███████║███████╗
╚═╝  ╚═╝╚══════╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝
      ███████╗███╗   ██╗ ██████╗ ██╗███╗   ██╗███████╗███████╗██████╗ 
      ██╔════╝████╗  ██║██╔════╝ ██║████╗  ██║██╔════╝██╔════╝██╔══██╗
      █████╗  ██╔██╗ ██║██║  ███╗██║██╔██╗ ██║█████╗  █████╗  ██████╔╝
      ██╔══╝  ██║╚██╗██║██║   ██║██║██║╚██╗██║██╔══╝  ██╔══╝  ██╔══██╗
      ███████╗██║ ╚████║╚██████╔╝██║██║ ╚████║███████╗███████╗██║  ██║
      ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝╚═╝  ╚═╝
`;

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    inspectOnly: false,
    json: false,
  };

  // Check if the first argument is a URL (not a flag)
  if (argv[0] && !argv[0].startsWith("-")) {
    args.url = argv[0];
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    switch (token) {
      case "--url":
        args.url = next;
        index += 1;
        break;
      case "--goal":
        args.goal = next;
        index += 1;
        break;
      case "--style":
        args.outputStyle = next;
        index += 1;
        break;
      case "--language":
        args.language = next;
        index += 1;
        break;
      case "--provider":
        args.provider = next;
        index += 1;
        break;
      case "--model":
        args.model = next;
        index += 1;
        break;
      case "--extra":
        args.extraContext = next;
        index += 1;
        break;
      case "--base-url":
        args.baseUrl = next;
        index += 1;
        break;
      case "--inspect-only":
        args.inspectOnly = true;
        break;
      case "--agent":
        args.isAgentMode = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "--help":
        args.help = true;
        break;
    }
  }

  return args;
}

function printBanner() {
  const g = gradient.default || gradient;
  const claudeOrange = g("#D97757", "#FCAB64", "#D97757");
  console.log(claudeOrange.multiline(LOGO_TEXT));
  console.log(
    chalk
      .hex("#D97757")
      .bold(`   ${figures.star} Welcome to ${APP_NAME} ${figures.star}`),
  );
  console.log(
    chalk.dim("   Designed for Deep Repo Analysis and Engineering Insights\n"),
  );
}

function printHelp() {
  printBanner();
  console.log(
    boxen(
      chalk.white(`Usage:
  npm run tui
  node cli/index.js --url <github-url> [options]

Options:
  --goal <text>        Target analysis goal
  --provider <name>    AI Provider (openai, anthropic, etc.)
  --model <id>         AI Model ID (optional)
  --style <style>      summary, deep, step-by-step, refactoring, security, perfection, blueprint
  --language <lang>    Thai, English, Bilingual
  --inspect-only       Skip AI analysis
  --json               Output raw JSON
  --help               Show this help message`),
      { padding: 1, borderColor: "blue", borderStyle: "round" },
    ),
  );
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || `Request failed with status ${response.status}`,
    );
  }

  return data;
}

function divider(step, title, color = "blue", total = 4) {
  const stepText = chalk.bold(` [STEP ${step}/${total}] `);
  const titleText = chalk[color].bold(` ${figures.pointerSmall} ${title} `);
  const line = chalk.dim(
    "─".repeat(
      Math.max(
        0,
        (process.stdout.columns || 80) - title.length - stepText.length - 15,
      ),
    ),
  );
  console.log(`\n${chalk.bgCyan.black(stepText)}${titleText}${line}\n`);
}

function summaryBox(title, content, color = "cyan") {
  console.log(
    "\n" +
      boxen(chalk.white(content), {
        title: chalk[color].bold(title),
        titleAlignment: "left",
        padding: { left: 1, right: 1, top: 0, bottom: 0 },
        borderColor: color,
        borderStyle: "round",
        margin: { left: 2 },
      }),
  );
}

function renderMetadata(metadata) {
  const content = [
    `${chalk.cyan("Repo")}    : ${chalk.white(`${metadata.owner}/${metadata.repo}`)}`,
    `${chalk.cyan("Branch")}  : ${chalk.white(metadata.branch)}`,
    `${chalk.cyan("Type")}    : ${chalk.white(metadata.type)}`,
    `${chalk.cyan("Path")}    : ${chalk.white(metadata.path)}`,
    `${chalk.cyan("Private")} : ${metadata.private ? chalk.red("Yes") : chalk.green("No")}`,
    `${chalk.cyan("URL")}     : ${chalk.blue.underline(metadata.url)}`,
  ].join("\n");

  summaryBox("METADATA RECOVERY", content, "cyan");
}

function renderTree(tree) {
  divider("REPO TREE PREVIEW", "yellow");
  if (!tree.length) {
    console.log(chalk.dim("   No tree entries available"));
    return;
  }

  tree.slice(0, 20).forEach((item) => {
    const icon =
      item.type === "tree" || item.type === "dir"
        ? chalk.yellow(figures.folder || "󰉋")
        : chalk.blue(figures.file || "󰈚");
    const suffix = item.size ? chalk.dim(` (${item.size} bytes)`) : "";
    console.log(`   ${icon} ${item.path}${suffix}`);
  });

  if (tree.length > 20) {
    console.log(
      chalk.dim(
        `   ${figures.ellipsis || "..."} and ${tree.length - 20} more entries`,
      ),
    );
  }
}

function renderFile(file) {
  if (!file) return;

  divider("FILE PREVIEW", "magenta");
  console.log(
    `${chalk.magenta("Path:")} ${chalk.white(file.path)} ${chalk.dim(`(${file.size} bytes)`)}`,
  );

  if (file.content) {
    const lines = file.content.split("\n");
    const preview = lines.slice(0, 30).join("\n");
    const suffix =
      lines.length > 30 ? chalk.dim(`\n...(total ${lines.length} lines)`) : "";

    console.log(
      boxen(chalk.white(preview + suffix), {
        padding: 0.5,
        borderColor: "gray",
        borderStyle: "single",
        backgroundColor: "#1e1e1e",
      }),
    );
  }
}

function renderAnalysis(analysis) {
  const content = analysis.text || "No analysis available";
  console.log(
    boxen(chalk.greenBright(content), {
      padding: 1,
      borderColor: "green",
      borderStyle: "double",
      title: "AI ENGINEERING INSIGHTS",
      titleAlignment: "center",
    }),
  );
  return content;
}

async function handleOutputAction(content, metadata, health, githubContext) {
  const defaultOutputDir =
    process.env.DEFAULT_OUTPUT_DIR || path.join(__dirname, "..", "output");

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "What would you like to do with the result?",
      choices: [
        { name: `${figures.pointer || ">>"} Copy to Clipboard`, value: "copy" },
        {
          name: `${figures.folder || "[F]"} Export as Markdown (.md)`,
          value: "save-md",
        },
        {
          name: `${figures.folder || "[F]"} Export as Plain Text (.txt)`,
          value: "save-txt",
        },
        {
          name: `${figures.folder || "[F]"} Export as JSON (.json)`,
          value: "save-json",
        },
        {
          name: `${figures.settings || "[S]"} Change Provider/Settings`,
          value: "config",
        },
        { name: `${figures.tick || "[OK]"} Done (Quit)`, value: "quit" },
      ],
    },
  ]);

  if (action === "copy") {
    try {
      const platform = process.platform;
      let clipCmd;
      if (platform === "win32") clipCmd = "clip";
      else if (platform === "darwin") clipCmd = "pbcopy";
      else clipCmd = "xclip -selection clipboard";

      const proc = exec(clipCmd);
      proc.stdin.write(content);
      proc.stdin.end();
      console.log(
        chalk.green(`\n${figures.tick} Content copied to clipboard!`),
      );
    } catch {
      console.log(
        chalk.red(
          `\n${figures.cross} Clipboard not available on this platform. Use export instead.`,
        ),
      );
    }
    return handleOutputAction(content, metadata, health, githubContext);
  }

  if (action.startsWith("save-")) {
    const { customPath } = await inquirer.prompt([
      {
        type: "input",
        name: "customPath",
        message: "Enter output directory path:",
        default: defaultOutputDir,
      },
    ]);

    if (customPath !== process.env.DEFAULT_OUTPUT_DIR) {
      updateEnv("DEFAULT_OUTPUT_DIR", customPath);
      process.env.DEFAULT_OUTPUT_DIR = customPath;
    }

    const outputDir = path.resolve(customPath);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const baseName = `${metadata.owner}-${metadata.repo}`;
    const format = action.replace("save-", "");
    let filename, fileContent;

    switch (format) {
      case "md": {
        filename = `${baseName}-analysis.md`;
        const header = [
          "---",
          `# Reverse Engineer — Analysis Export`,
          `# Repo: ${metadata.owner}/${metadata.repo}`,
          `# Branch: ${metadata.branch}`,
          `# Type: ${metadata.type}`,
          `# Path: ${metadata.path}`,
          `# Date: ${new Date().toISOString()}`,
          "---",
          "",
        ].join("\n");
        fileContent = header + content;
        break;
      }
      case "txt": {
        filename = `${baseName}-analysis.txt`;
        fileContent = content;
        break;
      }
      case "json": {
        filename = `${baseName}-analysis.json`;
        fileContent = JSON.stringify(
          {
            meta: {
              repo: `${metadata.owner}/${metadata.repo}`,
              branch: metadata.branch,
              type: metadata.type,
              path: metadata.path,
              url: metadata.url,
              exportedAt: new Date().toISOString(),
            },
            analysis: content,
          },
          null,
          2,
        );
        break;
      }
    }

    const fullPath = path.join(outputDir, filename);
    fs.writeFileSync(fullPath, fileContent, "utf8");
    console.log(
      chalk.green(`\n${figures.tick} Saved to: ${chalk.bold(fullPath)}`),
    );
    return handleOutputAction(content, metadata, health, githubContext);
  }

  if (action === "config") {
    await configureProvider(health);
    console.log(chalk.yellow("\nSettings updated. Please restart analysis."));
    return;
  }

  return;
}

async function configureProvider(health) {
  const providers = Object.entries(health.providers || {}).map(([id, p]) => ({
    name: `${p.label} ${p.configured ? chalk.green(`(${figures.tick} Ready: ${p.model})`) : chalk.dim(`(${figures.cross} Not Configured)`)}`,
    value: id,
    configured: p.configured,
  }));

  const { providerId } = await inquirer.prompt([
    {
      type: "list",
      name: "providerId",
      message: "Select AI Provider to configure/use:",
      choices: providers,
    },
  ]);

  const p = health.providers[providerId];
  if (!p.configured) {
    const keyName = `${providerId.toUpperCase()}_API_KEY`;
    const { apiKey } = await inquirer.prompt([
      {
        type: "password",
        name: "apiKey",
        message: `Enter API Key for ${p.label} (${keyName}):`,
        mask: "*",
      },
    ]);

    if (apiKey) {
      updateEnv(keyName, apiKey);
      console.log(chalk.green(`\n${figures.tick} API Key saved to ${configManager.getConfigPath()}`));
      p.configured = true;
    }
  }

  const { model } = await inquirer.prompt([
    {
      type: "input",
      name: "model",
      message: `Preferred Model for ${p.label} (default: ${p.model}):`,
      default: p.model,
    },
  ]);

  updateEnv("DEFAULT_PROVIDER", providerId);
  const modelKey = `${providerId.toUpperCase()}_MODEL`;
  updateEnv(modelKey, model);

  console.log(
    chalk.cyan(
      `\n${figures.star} Default provider set to: ${chalk.bold(providerId)} / ${chalk.bold(model)}`,
    ),
  );
  return { provider: providerId, model };
}

async function promptForMissing(args, health = {}) {
  if (args.url) return args;

  printBanner();

  const { choice } = await inquirer.prompt([
    {
      type: "list",
      name: "choice",
      message: "What would you like to do?",
      choices: [
        {
          name: `[>] Analyze a Repository`,
          value: "analyze",
        },
        {
          name: `[A] Agent Sandbox Mode (Self-Exploring AI)`,
          value: "agent",
        },
        {
          name: `[*] Configure API Keys / Models`,
          value: "config",
        },
        { name: `[x] Exit`, value: "exit" },
      ],
    },
  ]);

  if (choice === "exit") process.exit(0);

  if (choice === "config") {
    await configureProvider(health);
    return promptForMissing(args, health);
  }

  const primaryAnswer = await inquirer.prompt([
    {
      type: "input",
      name: "url",
      message: "Enter GitHub URL:",
      validate: (input) => input.trim() !== "" || "URL is required",
    },
  ]);

  args.url = primaryAnswer.url;

  if (choice === "agent") {
    args.isAgentMode = true;
    return args;
  }

  const { mode } = await inquirer.prompt([
    {
      type: "list",
      name: "mode",
      message: "Proceed with defaults or customize?",
      choices: [
        { name: `[>] Just go! (Fast Track)`, value: "fast" },
        { name: `[*] Customize options`, value: "custom" },
      ],
      default: "fast",
    },
  ]);

  if (mode === "fast") {
    args.outputStyle = args.outputStyle || DEFAULT_STYLE;
    args.language = args.language || DEFAULT_LANGUAGE;
    return args;
  }

  const questions = [];

  if (!args.goal && !args.inspectOnly) {
    questions.push({
      type: "input",
      name: "goal",
      message: "What's the goal of this analysis? (optional):",
    });
  }

  if (!args.outputStyle) {
    questions.push({
      type: "list",
      name: "outputStyle",
      message: "Choose analysis style:",
      choices: [
        "summary",
        "deep",
        "step-by-step",
        "refactoring",
        "security",
        "perfection",
        "blueprint",
      ],
      default: DEFAULT_STYLE,
    });
  }

  if (!args.language) {
    questions.push({
      type: "list",
      name: "language",
      message: "Choose output language:",
      choices: ["Thai", "English", "Bilingual"],
      default: DEFAULT_LANGUAGE,
    });
  }

  if (!args.provider) {
    questions.push({
      type: "input",
      name: "provider",
      message: "AI Provider (default: openai):",
      default: DEFAULT_PROVIDER,
    });
  }

  const answers = await inquirer.prompt(questions);
  return { ...args, ...answers };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  let health = {};
  try {
    health = await fetchJson(`${args.baseUrl}/api/health`);
  } catch (e) {
    console.log(
      chalk.yellow(
        `${figures.warning} Could not reach API server at ${args.baseUrl}. Some features may not work.`,
      ),
    );
  }

  const finalArgs = await promptForMissing(args, health);

  if (!finalArgs.url) {
    console.log(chalk.red(`${figures.cross} Error: GitHub URL is required.`));
    process.exit(1);
  }

  try {
    divider(1, "Handshake & Engine Check", "blue");
    const serverHealth = await fetchJson(`${finalArgs.baseUrl}/api/health`);

    const serverInfo = [
      `${chalk.cyan("API Gateway")}   : ${chalk.white(finalArgs.baseUrl)}`,
      `${chalk.cyan("AI Gateway")}    : ${serverHealth.ok ? chalk.green("CONNECTED") : chalk.red("DISCONNECTED")}`,
      `${chalk.cyan("Active Prov")}   : ${chalk.yellow(serverHealth.defaultProvider)}`,
    ].join("\n");

    console.log(
      boxen(serverInfo, {
        padding: { left: 1, right: 1, top: 0, bottom: 0 },
        borderColor: "blue",
        borderStyle: "round",
        title: "SYSTEM STATUS",
      }),
    );

    divider(2, "Deep Repository Extraction", "cyan");
    const inspectSpinner = ora(
      `Mining data from: ${chalk.blue(finalArgs.url)}`,
    ).start();
    const githubContext = await fetchJson(
      `${finalArgs.baseUrl}/api/github/inspect?url=${encodeURIComponent(finalArgs.url)}`,
    );
    inspectSpinner.succeed(chalk.green("Data extraction complete."));

    if (finalArgs.json && finalArgs.inspectOnly) {
      console.log(JSON.stringify(githubContext, null, 2));
      return;
    }

    renderMetadata(githubContext.metadata);
    renderTree(githubContext.tree || []);
    renderFile(githubContext.file);

    if (finalArgs.inspectOnly) {
      console.log(
        chalk.yellow(
          `\n${figures.info} Inspect-only mode enabled. Execution finished at Phase 2.`,
        ),
      );
      return;
    }

    if (finalArgs.isAgentMode) {
      divider(3, "Autonomous Agent Sandbox Active", "magenta");
      const agentSpinner = ora({
        text: `Initializing AI Agent in secure temp sandbox...`,
        color: "cyan",
        spinner: "bouncingBar"
      }).start();

      let finalContent = "";
      
      const response = await fetch(`${finalArgs.baseUrl}/api/agent/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: finalArgs.url })
      });

      if (!response.ok) throw new Error(`Agent stream failed: ${response.status}`);

      process.stdout.write("\n");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim().startsWith("data: ")) continue;
          const dataStr = line.replace("data: ", "").trim();
          if (dataStr === "[DONE]") { agentSpinner.succeed("Agent Sandbox Loop Complete."); continue; }
          
          try {
            const data = JSON.parse(dataStr);
            if (data.log) {
               console.log(chalk.gray(`   ${data.log}`));
            }
            if (data.chunk) {
               if(finalContent === "") {
                 console.log(chalk.magenta.bold(`\n${figures.star} --- ULTIMATE PROMPT GENERATED --- \n`));
               }
               finalContent += data.chunk;
               process.stdout.write(chalk.greenBright(data.chunk));
            }
          } catch(e) {}
        }
      }
      process.stdout.write("\n\n");
      
      divider(4, "Insight Delivery & Export", "green");
      await handleOutputAction(finalContent, githubContext.metadata, serverHealth, githubContext);
      return;
    }

    divider(3, "AI Synthesis & Pattern Analysis", "magenta");
    const analysisSpinner = ora({
      text: `Syncing with code-neural networks via ${chalk.bold(serverHealth.defaultProvider)}...`,
      color: "magenta",
    }).start();

    let selectedProvider = finalArgs.provider || serverHealth.defaultProvider;

    if (
      (!selectedProvider || selectedProvider === "openai") &&
      !serverHealth.hasOpenAIKey
    ) {
      const firstConfigured = Object.entries(serverHealth.providers || {}).find(
        ([_, p]) => p.configured,
      );
      if (firstConfigured) {
        selectedProvider = firstConfigured[0];
      }
    }

    const shouldStream = DEFAULT_STREAMING && !finalArgs.json;

    const response = await fetch(`${finalArgs.baseUrl}/api/analyze/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        githubContext,
        goal: finalArgs.goal || "",
        outputStyle: finalArgs.outputStyle || DEFAULT_STYLE,
        language: finalArgs.language || DEFAULT_LANGUAGE,
        provider: selectedProvider,
        model: finalArgs.model || "",
        extraContext: finalArgs.extraContext || "",
        stream: shouldStream,
      }),
    });

    if (!response.ok)
      throw new Error(`Analysis connection failed: ${response.status}`);

    let finalContent = "";

    if (shouldStream) {
      analysisSpinner.succeed(
        chalk.green(
          "Intelligence synthesis handshake successful. Receiving stream...",
        ),
      );
      process.stdout.write("\n");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim().startsWith("data: ")) continue;
          const dataStr = line.replace("data: ", "").trim();
          if (dataStr === "[DONE]") continue;

          try {
            const data = JSON.parse(dataStr);
            if (data.chunk) {
              const part = data.chunk;
              finalContent += part;
              process.stdout.write(part);
            }
          } catch (e) {}
        }
      }
    } else {
      analysisSpinner.text =
        "Engaging long-form architectural synthesis... This may take up to 2 minutes.";
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      finalContent = data.text || "";
      analysisSpinner.succeed(chalk.green("Deep synthesis complete."));
      console.log(chalk.dim("\n --- ANALYSIS PREVIEW START --- \n"));
      console.log(finalContent);
      console.log(chalk.dim("\n --- ANALYSIS PREVIEW END --- \n"));
    }
    process.stdout.write("\n\n"); // End of stream spacing

    if (finalArgs.json) {
      console.log(
        JSON.stringify(
          { githubContext, analysis: { text: finalContent } },
          null,
          2,
        ),
      );
      return;
    }

    divider(4, "Insight Delivery & Export", "green");
    await handleOutputAction(
      finalContent,
      githubContext.metadata,
      serverHealth,
      githubContext,
    );

    summaryBox(
      "MISSION STATUS",
      `${figures.tick} REVERSE ENGINEERING SUCCESSFUL\n${figures.star} Insights ready for engineering team.`,
      "green",
    );
  } catch (error) {
    console.error(
      chalk.red(`\n${figures.warning} Critical Error: ${error.message}`),
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(chalk.red(`${figures.cross} Fatal Error: ${error.message}`));
  process.exit(1);
});
