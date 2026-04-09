# REVERSE ENGINEER

![REVERSE ENGINEER - AI Repository Analysis](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/02_tui_main_menu.png)

> [!NOTE]
> [Thai Version here / ดูฉบับภาษาไทยที่นี่](README.md)

## Advanced Repository Analysis & Technical Blueprinting Hub (v1.1.6+)

**REVERSE ENGINEER (blueprompt)** is a sophisticated hybrid engineering tool designed for analyzing and decomposing complex GitHub repositories and live websites. It extracts high-fidelity context using **Playwright-driven browser simulation**, leverages advanced AI models to map architectural patterns, and generates prompt-ready technical blueprints that can be handed directly to another coding model.

### Key Capabilities

- **Browser Simulation (Playwright)**: The agent can now visit live URLs, render SPAs, and capture background XHR/Fetch API calls.
- **Deep JS De-obfuscation**: Automatically beautifies minified JavaScript for more accurate AI reasoning.
- **Structured Working Memory**: Agent Sandbox writes to `ANALYSIS_RESULT_DRAFT.md` during exploration instead of relying on model memory alone.
- **Facts vs Hypotheses Discipline**: Draft sections explicitly separate verified evidence from assumptions.
- **Prompt-Ready Finalization**: Final synthesis rewrites the draft into `BLUEPRINT_PROMPT.md` instead of returning raw analysis notes.
- **Live Draft Streaming**: Both TUI and Web Dashboard show append/replace operations as the draft evolves.
- **Enhanced Reliability**: Safe exit logic and sanitized file exports for cross-platform stability.

---

## Step-by-Step Engineering Journey

Experience the visual depth of our hybrid engineering process:

![Step 01](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/01.png)
![Step 02](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/02.png)
![Step 03](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/03.png)
![Step 04](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/04.png)
![Step 05](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/05.png)
![Step 06](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/06.png)
![Step 07](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/07.png)
![Step 08](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/08.png)
![Step 09](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/09.png)
![Step 10](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/10.png)
![Step 11](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/11.png)
![Step 12](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/12.png)

---

## Technical Setup

### 1. Quick Start

Run instantly without installation:

```bash
npx blueprompt
```

### 2. Manual Installation

```bash
npm install
```

### 3. User Configuration

**REVERSE ENGINEER (blueprompt)** offers flexible configuration:

1. **Persistent Configuration (Recommended)**: Use the `[*] Configure API Keys / Models` menu during your first run to save credentials securely in your machine's AppData. This persists across different project directories and `npx` sessions.
2. **Local .env file**: Alternatively, create a `.env` file in the project root:

```env
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
KILOCODE_API_KEY=your_key_here
GITHUB_TOKEN=recommended_for_higher_limits
```

### 4. Custom AI Prompts (Prompt Engineering)

Unique to this tool is the ability to edit the **System Prompts** used by the AI. Via the `[P] Edit Prompt Templates` menu, you can tailor how the AI explores codebases (e.g., focus on security, summarize briefly, or change its technical persona). Custom prompts are stored in your home directory or AppData.

### 5. Standard Execution

```bash
npm start
```

### 6. Agent Sandbox Outputs

When you run Agent Sandbox mode, the system produces two distinct artifacts:

- `ANALYSIS_RESULT_DRAFT.md`: working-memory draft used during investigation
- `BLUEPRINT_PROMPT.md`: final prompt-ready blueprint intended for handoff to another coding model

Legacy `SYSTEM_BLUEPRINT.md` files are still read as prior knowledge when present, but new runs now write the final artifact to `BLUEPRINT_PROMPT.md`.

---

## Headless CLI Operations

Access direct terminal commands with the following syntax:

```bash
# Full repository analysis with blueprint output
npm run tui --url "[github-url]" --style blueprint --language Thai

# Focused file analysis using a specific AI provider
npm run tui --url "[github-file-url]" --provider anthropic --model claude-3-5-sonnet-latest

# Run Agent Sandbox with structured draft memory and final blueprint prompt output
node cli/index.js --url "[github-url]" --agent
```

---

## Project Architecture

- `/cli`: Professional Terminal User Interface implementation.
- `/server`: High-performance API Gateway and GitHub mining engine.
- `/public`: Static source for the web dashboard.
- `index.js`: Unified launcher and system entry point.

---

© 2026 REVERSE ENGINEER | Engineered for Architects and Security Researchers.
