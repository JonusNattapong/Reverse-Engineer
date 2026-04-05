#!/usr/bin/env node
const inquirer = require("inquirer");
const { spawn } = require("child_process");
const path = require("path");
const chalk = require("chalk");
const figures = require("figures");

async function main() {
  console.clear();
  console.log(chalk.bold.hex("#D97757")(`\n   ${figures.star} REVERSE ENGINEER OPERATING SYSTEM ${figures.star}\n`));

  const { mode } = await inquirer.prompt([
    {
      type: "list",
      name: "mode",
      message: "How would you like to process your mission today?",
      choices: [
        { name: "[W] Web Dashboard - Focus on visual experience (Launches Server)", value: "web" },
        { name: "[T] TUI Mode - Focus on terminal engineering (Server runs in Background)", value: "tui" },
        { name: "[x] Exit", value: "exit" }
      ],
    },
  ]);

  if (mode === "exit") process.exit(0);

  if (mode === "web") {
    console.log(chalk.green(`\n${figures.tick} Launching API Gateway & Web Interface...\n`));
    const serverPath = path.join(__dirname, "server", "index.js");
    const server = spawn("node", [serverPath], { stdio: "inherit" });
    server.on("close", (code) => process.exit(code));
  } 
  
  if (mode === "tui") {
    console.log(chalk.yellow(`\n${figures.play} Initializing API Gateway in background...`));
    
    // Start server independently in background
    const serverPath = path.join(__dirname, "server", "index.js");
    const server = spawn("node", [serverPath], {
      stdio: ["ignore", "ignore", "inherit"], // Hide logs but show errors
      detached: false
    });

    server.on("error", (err) => {
      console.error(chalk.red(`${figures.cross} Server failed to start: ${err.message}`));
      process.exit(1);
    });

    console.log(chalk.cyan(`${figures.info} Waiting for API Gateway to become ready...`));

    // Health check loop — wait up to 10 seconds
    const maxWait = 10000;
    const interval = 500;
    let elapsed = 0;
    let serverReady = false;

    while (elapsed < maxWait) {
      try {
        const res = await fetch("http://localhost:3000/api/health");
        if (res.ok) { serverReady = true; break; }
      } catch {}
      await new Promise(r => setTimeout(r, interval));
      elapsed += interval;
    }

    if (!serverReady) {
      console.error(chalk.red(`${figures.cross} API Gateway failed to start within ${maxWait / 1000}s. Port may be in use.`));
      server.kill();
      process.exit(1);
    }

    console.log(chalk.green(`${figures.tick} API Gateway ready. Launching TUI...\n`));

    const cliPath = path.join(__dirname, "cli", "index.js");
    const cli = spawn("node", [cliPath], { stdio: "inherit" });
    
    cli.on("close", (code) => {
      server.kill(); // Kill background server when CLI is done
      process.exit(code);
    });
  }
}

main().catch((err) => {
  console.error(chalk.red(`${figures.cross} Boot Error: ${err.message}`));
});
