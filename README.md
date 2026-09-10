# Trao AI Interview Kit

An end-to-end AI-powered interview preparation platform. Generates customized role briefs, day-by-day study schedules, multi-category interview questions with rubric criteria, and interactive study flashcards from a job description and company URL.

---

## Flashcard Practice Mode: Spaced Repetition Design Defense

In Phase 6, the flashcard practice mode employs a **confidence-weighted sort** rather than a classical algorithmic spaced repetition model like **SuperMemo-2 (SM-2)** or **Anki's Leitner system**.

### Architectural Rationale & Defense:
1. **Time Horizon Mismatch**:
   - Algorithms like SM-2 or FSRS are designed for **multi-month or multi-year memory retention** (e.g., medical board exams, language vocabulary acquisition). They depend on intervals expanding exponentially over days, weeks, and months (1 day &rarr; 3 days &rarr; 10 days &rarr; 30 days).
   - In contrast, Trao AI Interview Kits are calibrated for **acute, high-intensity interview preparation over 1 to 60 days** (commonly 3–7 days before an interview).
2. **Immediate Weak-Spot Remediation**:
   - When a candidate prepares for an interview in 48–72 hours, they cannot wait 6 days for an algorithm to resurface a forgotten card.
   - The confidence-weighted queue sorts flashcards strictly by:
     1. **Unseen cards first**: Guarantees complete syllabus coverage across the kit.
     2. **Low confidence cards (`😟 Again` [1]) next**: Immediately surfaces areas of vulnerability so candidates can drill their weak spots repeatedly within the same preparation day.
     3. **Unsure cards (`😐 Unsure` [2]) next**.
     4. **Mastered cards (`😊 Got it` [3]) last**.
3. **Session Interactivity & Keyboard Acceleration**:
   - Fullscreen 3D flip card (`Space` to flip, `1`/`2`/`3` to rate confidence, `&rarr;` to skip).
   - Instant persistence to `practiceState` on the Kit model.
   - Real-time coverage progress bar and post-session breakdown of weak spots.

---

## Monorepo Architecture

- **`packages/shared`**:
  - Appendix A and Appendix B TypeScript interfaces.
  - Zod validation schemas with cross-field constraint enforcement.
- **`packages/server`**:
  - Express 5 REST API with session authentication (MongoStore/MemoryStore).
  - 13-stage deterministic and LLM-powered generation pipeline:
    - Resilient scraper (SSRF protection, robots.txt, 1MB limits, keyword-weighted BFS crawl).
    - Gemini REST client with exponential backoff, JSON schema repair, and prompt injection safety fences.
    - Deterministic schedule allocator using Hamilton largest-remainder integer distribution.
    - Coverage verification loop.
  - Optimistic concurrency control (`version` checking on `PUT /api/kits/:id` with 409 conflict detection).
  - 107 passing automated test suites.
- **`packages/web`**:
  - Next.js 14 frontend with App Router, TypeScript, pure Tailwind CSS.
  - Live Server-Sent Events (SSE) progress stream with polling fallback.
  - Kit Builder with `@dnd-kit/sortable` drag-and-drop, keyboard reordering (`Alt+Up/Down`), inline editing, and stable-ID pinned item preservation across section regenerations.
  - Flashcard Practice Mode with 3D card flip animations and coverage analytics.

---

## Verification Commands

- **Run Server Test Suites** (107 tests):
  ```bash
  npm run test:server
  ```
- **Build Web Frontend** (Next.js 14):
  ```bash
  npm run build -w packages/web
  ```
