# REVERSE ENGINEER

![REVERSE ENGINEER - AI Repository Analysis](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/02_tui_main_menu.png)

> [!NOTE]
> [Thai Version here / ดูฉบับภาษาไทยที่นี่](README.md)

## Advanced Repository Analysis & Technical Blueprinting Hub (v1.1.0+)

**REVERSE ENGINEER (blueprompt)** is a sophisticated hybrid engineering tool designed for analyzing and decomposing complex GitHub repositories and live websites. It extracts high-fidelity context using **Playwright-driven browser simulation**, leverages advanced AI models to map architectural patterns, and generates comprehensive implementation specifications.

### 🌟 New in v1.1.0: Hybrid Analysis Engine
- **Browser Simulation (Playwright)**: The agent can now visit live URLs, render SPAs, and capture background XHR/Fetch API calls.
- **Deep JS De-obfuscation**: Automatically beautifies minified JavaScript for more accurate AI reasoning.
- **Enhanced Reliability**: Safe exit logic and sanitized file exports for cross-platform stability.

---

## Technical Workflow (12-Step Journey)

Experience the full depth of our engineering process:

| Phase | Description | Interface Preview |
|-------|-------------|-------------------|
| **01** | **Launcher & Operation Select**: Choose between Web Dashboard or TUI mode. | ![Step 01](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/01_launcher_menu.png) |
| **02** | **TUI Command Center**: The main dashboard with cinematic CLI aesthetics. | ![Step 02](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/02_tui_main_menu.png) |
| **03** | **AI Provider Intelligence**: Configure your preferred AI model (OpenAI, Claude, etc). | ![Step 03](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/03_provider_config.png) |
| **04** | **Strategy Selection**: Choose from various analysis prompts (Blueprint/Security). | ![Step 04](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/04_prompt_selection.png) |
| **05** | **Prompt Customization**: Deeply tune the system prompt for your specific target. | ![Step 05](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/05_prompt_editor.png) |
| **06** | **Target Lockdown**: Lock in your workspace path and project target. | ![Step 06](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/06_workspace_setup.png) |
| **07** | **Engine Handshake**: Verify API connectivity and AI readiness. | ![Step 07](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/07_handshake_status.png) |
| **08** | **Deep Extraction**: Metadata mining and project tree reconstruction. | ![Step 08](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/08_extraction_phase.png) |
| **09** | **Agent Sandbox Active**: AI agent performs live site inspection and logic audit. | ![Step 09](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/09_agent_sandbox.png) |
| **10** | **Synthesis Complete**: The AI generates the ultimate system blueprint. | ![Step 10](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/10_synthesis_complete.png) |
| **11** | **Multi-Format Export**: Securely save results in MD, Text, or JSON. | ![Step 11](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/11_delivery_export.png) |
| **12** | **Engineering Insights**: The final blueprint, ready for implementation. | ![Step 12](https://raw.githubusercontent.com/JonusNattapong/Reverse-Engineer/main/assets/12_blueprint_showcase.png) |

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

1.  **Persistent Configuration (Recommended)**: Use the `[*] Configure API Keys / Models` menu during your first run to save credentials securely in your machine's AppData. This persists across different project directories and `npx` sessions.
2.  **Local .env file**: Alternatively, create a `.env` file in the project root:

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

---

## Headless CLI Operations

Access direct terminal commands with the following syntax:

```bash
# Full repository analysis with blueprint output
npm run tui --url "[github-url]" --style blueprint --language Thai

# Focused file analysis using a specific AI provider
npm run tui --url "[github-file-url]" --provider anthropic --model claude-3-5-sonnet-latest
```

---

## Project Architecture

- `/cli`: Professional Terminal User Interface implementation.
- `/server`: High-performance API Gateway and GitHub mining engine.
- `/public`: Static source for the web dashboard.
- `index.js`: Unified launcher and system entry point.

---

© 2026 REVERSE ENGINEER | Engineered for Architects and Security Researchers.
