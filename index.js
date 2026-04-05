const inquirer = require("inquirer");
const { spawn } = require("child_process");
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
        { name: "🌐 Web Dashboard - Focus on visual experience (Launches Server)", value: "web" },
        { name: "💻 TUI Mode - Focus on terminal engineering (Server runs in Background)", value: "tui" },
        { name: "✖ Exit", value: "exit" }
      ],
    },
  ]);

  if (mode === "exit") process.exit(0);

  if (mode === "web") {
    console.log(chalk.green(`\n${figures.tick} Launching API Gateway & Web Interface...\n`));
    const server = spawn("node", ["server/index.js"], { stdio: "inherit" });
    server.on("close", (code) => process.exit(code));
  } 
  
  if (mode === "tui") {
    console.log(chalk.yellow(`\n${figures.play} Initializing API Gateway in background...`));
    
    // Start server independently in background
    const server = spawn("node", ["server/index.js"], {
      stdio: ["ignore", "ignore", "inherit"], // Hide logs but show errors
      detached: false
    });

    console.log(chalk.cyan(`${figures.info} Cloud Engine is warming up. Jumping to TUI interface...\n`));

    // Wait a bit for server to bind port
    setTimeout(() => {
      const cli = spawn("node", ["cli/index.js"], { stdio: "inherit" });
      
      cli.on("close", (code) => {
        server.kill(); // Kill background server when CLI is done
        process.exit(code);
      });
    }, 1500);
  }
}

main().catch((err) => {
  console.error(chalk.red(`${figures.cross} Boot Error: ${err.message}`));
});
