# REVERSE ENGINEER

![REVERSE ENGINEER - AI Repository Analysis](assets/title.png)

> [!TIP]
> [English Version here](README-EN.md)

## ระบบวิเคราะห์และถอดรหัสโครงสร้าง GitHub Repository ด้วย AI

**REVERSE ENGINEER** เป็นเครื่องมือระดับวิศวกรรมสำหรับวิเคราะห์และทำความเข้าใจโครงสร้างซอฟต์แวร์ที่ซับซ้อน โดยการดึงบริบทจริงจาก GitHub และใช้โมเดล AI ขั้นสูงในการประมวลผลตรรกะ ระบุรูปแบบ (Patterns) และสร้างพิมพ์เขียวทางเทคนิค (Technical Blueprints) เพื่อเป็นรากฐานในการพัฒนาหรือติดตั้งระบบใหม่

---

## คุณสมบัติหลัก

### 1. Web Dashboard (Bento UI)

- **Bento Interface**: การจัดวางข้อมูลแบบโมเดิร์นที่รวบรวมฟังก์ชันการทำงานไว้ในหน้าเดียว
- **Cinematic Dark Mode**: ดีไซน์ระดับพรีเมียมที่ออกแบบมาเพื่อลดมลภาวะทางสายตาสำหรับการวิเคราะห์เชิงลึก
- **Blueprint Mode**: ระบบสร้าง Technical Prompts สำหรับส่งต่อข้อมูลสถาปัตยกรรมไปยัง AI ตัวอื่นเพื่อการสร้างโค้ดที่มีความแม่นยำสูง

### 2. Professional 4-Phase TUI

- **Structured Workflow**: ระบบการทำงานแบบ 4 ขั้นตอน ตั้งแต่การตรวจสอบระบบ (Handshake), การสกัดข้อมูล (Extraction), การวิเคราะห์เชิงลึก (Synthesis) ไปจนถึงการส่งมอบข้อมูล (Delivery)
- **Engineering Aesthetics**: ธีมระดับพรีเมียมที่ได้รับแรงบันดาลใจจาก Claude พร้อมโลโก้ ASCII สำหรับผู้ใช้งานผ่าน Terminal

### 3. Blueprint Generation (The System Architect)

- แตกต่างจากการสรุปโค้ดทั่วไป โหมดนี้ออกแบบมาเพื่อสร้าง "ข้อกำหนดทางเทคนิค (Technical Specification)" ที่ครอบคลุมทั้งโครงสร้างข้อมูล, ตรรกะสำคัญ และความสัมพันธ์ระหว่างโมดูล
- เหมาะสำหรับการนำพิมพ์เขียวไปใช้ใน AI Coding Assistants เพื่อจำลองระบบหรือพัฒนาต่อยอด (Re-implementation)

### 4. Unified Launcher

- ระบบ Launcher ที่ช่วยใหเข้าถึงทั้ง Web Interface และ TUI Mode ได้ผ่านการควบคุมเดียว โดยระบบจะจัดการการทำงานของ Server ในพื้นหลังให้อัตโนมัติ

---

## หน้าตาของระบบ (Interface Showcase)

| Web Dashboard | TUI Operation |
| :---: | :---: |
| ![REVERSE ENGINEER Web Interface](assets/start.png) | ![REVERSE ENGINEER TUI Phase](assets/step.png) |

---

## การเริ่มต้นใช้งาน

### 1. การติดตั้ง (Installation)

```bash
npm install
```

### 2. การตั้งค่า Environment

สร้างไฟล์ `.env` ที่ Root ของโครงการและระบุ API Keys:

```env
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
KILOCODE_API_KEY=your_key_here
GITHUB_TOKEN=recommended_for_higher_limits
```

### 3. การรันระบบ

```bash
npm start
```

---

## การใช้งานขั้นสูงผ่าน CLI

สำหรับการรันคำสั่งโดยตรงผ่าน Terminal พร้อมพารามิเตอร์:

```bash
# วิเคราะห์ทั้ง Repository ในรูปแบบ Blueprint (ภาษาไทย)
npm run tui --url "[github-url]" --style blueprint --language Thai

# เจาะจงวิเคราะห์ไฟล์ด้วย Anthropic Claude
npm run tui --url "[github-file-url]" --provider anthropic --model claude-3-5-sonnet-latest
```

---

## โครงสร้างโครงการ

- `/cli`: ตรรกะและอินเทอร์เฟซผู้ใช้งานผ่าน Terminal
- `/server`: API Gateway และระบบการจัดการข้อมูลจาก GitHub
- `/public`: ระบบแสดงผลหน้าเว็บ (Dashboard)
- `index.js`: ระบบ Launcher หลัก

---

© 2026 REVERSE ENGINEER | Engineered for Architects and Security Researchers.
