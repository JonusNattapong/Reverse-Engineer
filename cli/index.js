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

const DEFAULT_BASE_URL =
  process.env.REVERSE_ENGINEER_BASE_URL || "http://localhost:3000";
const DEFAULT_STYLE = "blueprint";
const DEFAULT_LANGUAGE = "Thai";
const DEFAULT_PROVIDER = process.env.DEFAULT_PROVIDER || "openai";

function updateEnv(key, value) {
  const envPath = path.join(process.cwd(), ".env");
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lines = content.split("\n");
  let found = false;

  const newLines = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) {
    newLines.push(`${key}=${value}`);
  }

  fs.writeFileSync(envPath, newLines.join("\n"), "utf8");
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
    chalk.hex("#D97757").bold(
      `   ${figures.star} Welcome to ${APP_NAME} ${figures.star}`,
    ),
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
  --style <style>      summary, deep, step-by-step, refactor, blueprint
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
  const line = chalk.dim("─".repeat(Math.max(0, (process.stdout.columns || 80) - title.length - stepText.length - 15)));
  console.log(`\n${chalk.bgCyan.black(stepText)}${titleText}${line}\n`);
}

function summaryBox(title, content, color = "cyan") {
  console.log("\n" + boxen(chalk.white(content), {
    title: chalk[color].bold(title),
    titleAlignment: "left",
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    borderColor: color,
    borderStyle: "round",
    margin: { left: 2 }
  }));
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

async function handleOutputAction(content, metadata, health) {
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "What would you like to do with the result?",
      choices: [
        { name: `${figures.pointer} Copy to Clipboard`, value: "copy" },
        { name: `${figures.folder} Save as Markdown (.md)`, value: "save" },
        {
          name: `${figures.settings} Change Provider/Settings`,
          value: "config",
        },
        { name: `${figures.tick} Done (Quit)`, value: "quit" },
      ],
    },
  ]);

  if (action === "copy") {
    const proc = exec("clip");
    proc.stdin.write(content);
    proc.stdin.end();
    console.log(chalk.green(`\n${figures.tick} Content copied to clipboard!`));
    return handleOutputAction(content, metadata, health);
  }

  if (action === "save") {
    const filename = `${metadata.owner}-${metadata.repo}-analysis.md`;
    fs.writeFileSync(filename, content, "utf8");
    console.log(
      chalk.green(`\n${figures.tick} Saved to: ${chalk.bold(filename)}`),
    );
    return handleOutputAction(content, metadata, health);
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
      console.log(chalk.green(`\n${figures.tick} API Key saved to .env!`));
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
          name: `${figures.play || "▶"} Analyze a Repository`,
          value: "analyze",
        },
        {
          name: `${figures.settings || "⚙"} Configure API Keys / Models`,
          value: "config",
        },
        { name: `${figures.cross || "✖"} Exit`, value: "exit" },
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

  const { mode } = await inquirer.prompt([
    {
      type: "list",
      name: "mode",
      message: "Proceed with defaults or customize?",
      choices: [
        { name: `${figures.play} Just go! (Fast Track)`, value: "fast" },
        { name: `${figures.settings} Customize options`, value: "custom" },
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
      choices: ["summary", "deep", "step-by-step", "refactor", "blueprint"],
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
  } catch (e) {}

  const finalArgs = await promptForMissing(args, health);

  if (!finalArgs.url) {
    console.log(chalk.red(`${figures.cross} Error: GitHub URL is required.`));
    process.exit(1);
  }

  try {
    divider(1, "Handshake & Engine Check", "blue");
    const health = await fetchJson(`${finalArgs.baseUrl}/api/health`);
    
    const serverInfo = [
      `${chalk.cyan("API Gateway")}   : ${chalk.white(finalArgs.baseUrl)}`,
      `${chalk.cyan("AI Gateway")}    : ${health.ok ? chalk.green("CONNECTED") : chalk.red("DISCONNECTED")}`,
      `${chalk.cyan("Active Prov")}   : ${chalk.yellow(health.defaultProvider)}`,
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

    divider(3, "AI Synthesis & Pattern Analysis", "magenta");
    const analysisSpinner = ora({
      text: `Syncing with code-neural networks via ${chalk.bold(health.defaultProvider)}...`,
      color: "magenta",
    }).start();

    let selectedProvider = finalArgs.provider || health.defaultProvider;

    if (
      (!selectedProvider || selectedProvider === "openai") &&
      !health.hasOpenAIKey
    ) {
      const firstConfigured = Object.entries(health.providers || {}).find(
        ([_, p]) => p.configured,
      );
      if (firstConfigured) {
        selectedProvider = firstConfigured[0];
      }
    }

    const analysis = await fetchJson(`${finalArgs.baseUrl}/api/analyze`, {
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
      }),
    });
    analysisSpinner.succeed(chalk.green("Intelligence synthesis complete."));

    if (finalArgs.json) {
      console.log(JSON.stringify({ githubContext, analysis }, null, 2));
      return;
    }

    divider(4, "Insight Delivery & Export", "green");
    const finalContent = renderAnalysis(analysis);
    await handleOutputAction(finalContent, githubContext.metadata, health);
    
    summaryBox("MISSION STATUS", `${figures.tick} REVERSE ENGINEERING SUCCESSFUL\n${figures.star} Insights ready for engineering team.`, "green");
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
