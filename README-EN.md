# REVERSE ENGINEER

> [!NOTE]
> [Thai Version here](README.md)

### Analyze, Reverse, and Rebuild GitHub Projects using AI: Complete System Blueprints in One Click.

**REVERSE ENGINEER** is a developer's Swiss-Army knife for breaking down complex repositories. It extracts real context from GitHub then hands it over to elite AI models to map logic, resolve patterns, and generate "Implementation Blueprints" that other AI agents can use to recreate the codebase from scratch.

---

## What can it do?

### 🌐 High-Fidelity Dashboard
- **Bento UI**: Everything is where it should be—just like a modern app.
- **Cinematic Dark Mode**: A premium, noise-free environment for deep analysis.
- **Markdown Native**: Clean, readable AI insights with full syntax highlighting.
- **Blueprint Mode**: Zero-friction prompt generation for your favorite AI (Claude, GPT, etc.).

### 💻 Pro-Grade TUI
- **4-Phase Engine**: A structured workflow that guides you from "Checking Engine" to "Synthesis".
- **Visual Feedback**: Real-time status updates and a sleek Claude-inspired theme.

### 🎯 Blueprint Mode (The Secret Weapon)
- Instead of just summaries, it spits out a developer-ready **Technical Blueprint**.
- Everything from state shapes to processing flows is covered, allowing another AI to rebuild the system with near-perfect accuracy.

### ⚡ Smart Launcher
- Just run `npm start`. Choose your path—Web or TUI—and let the launcher handle the background server processes for you.

---

## Get Started

### 1. Install
```bash
npm install
```

### 2. Add Keys
Create a `.env` file and add your secret sauce:
```env
OPENAI_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
KILOCODE_API_KEY=your_key
GITHUB_TOKEN=recommended_for_api_limits
```

### 3. Run
```bash
npm start
```

---

## Deep Access (CLI Commands)

For the ones who prefer command lines:

```bash
# Analyze a full repo tree and generate a blueprint
npm run tui --url "link-to-repo" --style blueprint --language Thai

# Target a specific file using Claude
npm run tui --url "link-to-file" --provider anthropic --model claude-3-5-sonnet-latest
```

---

## Inside the Project

- `/cli`: The Terminal Interface heart.
- `/server`: The API Gateway & GitHub mining engine.
- `/public`: Web dashboard source code.
- `index.js`: The Unified Launcher.

---

© 2026 REVERSE ENGINEER | Engineered for Architects & Code Explorers.
