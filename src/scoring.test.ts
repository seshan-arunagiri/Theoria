import { analyzePrompt } from "./scoring";

// ─────────────────────────────────────────────────────────────────────────────
// CLARITY
// Rules:
//   >= 15 words → clarity = 20
//   >= 8 words  → clarity = 10,  feedback: "Add more detail…"
//   < 8 words   → clarity = 0,   feedback: "Prompt is too short…"
// ─────────────────────────────────────────────────────────────────────────────

describe("Clarity dimension", () => {
  test("short prompt (< 8 words) scores 0 and adds short-prompt feedback", () => {
    const result = analyzePrompt("Fix the login bug");
    expect(result.breakdown.clarity).toBe(0);
    expect(result.feedback).toContain(
      "Prompt is too short — describe the full goal"
    );
  });

  test("medium prompt (8–14 words) scores 10 and adds detail feedback", () => {
    // 10 words exactly
    const result = analyzePrompt(
      "Refactor the authentication module to remove duplicate token logic"
    );
    expect(result.breakdown.clarity).toBe(10);
    expect(result.feedback).toContain(
      "Add more detail to improve clarity (aim for 15+ words)"
    );
  });

  test("long prompt (>= 15 words) scores 20 and adds no clarity feedback", () => {
    const result = analyzePrompt(
      "Build a React component that displays a paginated list of users fetched from a REST API with loading and error states"
    );
    expect(result.breakdown.clarity).toBe(20);
    expect(result.feedback).not.toContain(
      "Prompt is too short — describe the full goal"
    );
    expect(result.feedback).not.toContain(
      "Add more detail to improve clarity (aim for 15+ words)"
    );
  });

  test("exactly 15 words scores 20", () => {
    // 15 words
    const result = analyzePrompt(
      "Write a function that parses a JSON file and returns an array of user objects"
    );
    expect(result.breakdown.clarity).toBe(20);
  });

  test("exactly 8 words scores 10", () => {
    // 8 words
    const result = analyzePrompt(
      "Add dark mode support to the settings page"
    );
    expect(result.breakdown.clarity).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT
// Rules:
//   Any contextKeyword present → context = 20
//   None present               → context = 0, feedback: "Add context…"
// Keywords include: react, typescript, python, node, api, backend, frontend,
//   database, sql, mongodb, aws, docker, rest, graphql, for, using, with, in
// ─────────────────────────────────────────────────────────────────────────────

describe("Context dimension", () => {
  test("prompt mentioning 'TypeScript' scores 20 for context", () => {
    const result = analyzePrompt(
      "Refactor this utility function in TypeScript to use generics instead of any"
    );
    expect(result.breakdown.context).toBe(20);
    expect(result.feedback).not.toContain(
      "Add context: mention the tech stack, language, or framework"
    );
  });

  test("prompt mentioning 'React' scores 20 for context", () => {
    const result = analyzePrompt(
      "Create a custom hook in React that debounces a search input value"
    );
    expect(result.breakdown.context).toBe(20);
  });

  test("prompt mentioning 'Python' scores 20 for context", () => {
    const result = analyzePrompt(
      "Write a Python script that reads a CSV file and outputs summary statistics"
    );
    expect(result.breakdown.context).toBe(20);
  });

  test("prompt mentioning 'SQL' scores 20 for context", () => {
    const result = analyzePrompt(
      "Optimise this SQL query so it doesn't perform a full table scan on the orders table"
    );
    expect(result.breakdown.context).toBe(20);
  });

  test("prompt with no tech-stack keyword scores 0 and adds context feedback", () => {
    // No keywords from the contextKeywords list — deliberately avoids 'for','with','using','in'
    const result = analyzePrompt(
      "Rewrite the authentication module to be cleaner"
    );
    expect(result.breakdown.context).toBe(0);
    expect(result.feedback).toContain(
      "Add context: mention the tech stack, language, or framework"
    );
  });

  test("'api' keyword (lowercase) triggers context score", () => {
    const result = analyzePrompt(
      "Build an api endpoint that returns paginated product data"
    );
    expect(result.breakdown.context).toBe(20);
  });

  test("'docker' keyword triggers context score", () => {
    const result = analyzePrompt(
      "Create a multi-stage docker build to reduce the final image size below 100MB"
    );
    expect(result.breakdown.context).toBe(20);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURE
// Rules:
//   hasVerb (starts with or contains imperative verb) → structure = 20
//   isQuestion (contains '?' or starts with 'how'/'what') → structure = 20
//   isMultiSentence (split on [.!?] gives >= 2 non-empty segments) → structure = 20
//   None of the above → structure = 0, feedback: "Start with a clear action verb…"
// ─────────────────────────────────────────────────────────────────────────────

describe("Structure dimension", () => {
  test("prompt starting with 'Build' scores 20 for structure", () => {
    const result = analyzePrompt(
      "Build a REST API with Node.js that handles CRUD operations for a blog"
    );
    expect(result.breakdown.structure).toBe(20);
  });

  test("prompt starting with 'Create' scores 20 for structure", () => {
    const result = analyzePrompt(
      "Create a pagination component in React that accepts totalPages and currentPage props"
    );
    expect(result.breakdown.structure).toBe(20);
  });

  test("prompt starting with 'Fix' scores 20 for structure", () => {
    const result = analyzePrompt(
      "Fix the race condition in the async data fetching hook that causes stale state updates"
    );
    expect(result.breakdown.structure).toBe(20);
  });

  test("prompt containing 'refactor' mid-sentence scores 20 for structure", () => {
    const result = analyzePrompt(
      "The codebase needs to refactor the database layer to use the repository pattern"
    );
    expect(result.breakdown.structure).toBe(20);
  });

  test("question starting with 'How' scores 20 for structure", () => {
    const result = analyzePrompt(
      "How should I structure a monorepo containing a Next.js frontend and an Express backend?"
    );
    expect(result.breakdown.structure).toBe(20);
  });

  test("question starting with 'What' scores 20 for structure", () => {
    const result = analyzePrompt(
      "What is the best way to handle optimistic updates in a React app using React Query?"
    );
    expect(result.breakdown.structure).toBe(20);
  });

  test("prompt with a '?' anywhere scores 20 for structure", () => {
    const result = analyzePrompt(
      "Should I use Zustand or Redux Toolkit for global state management in this project?"
    );
    expect(result.breakdown.structure).toBe(20);
  });

  test("multi-sentence prompt scores 20 for structure", () => {
    const result = analyzePrompt(
      "The app uses Prisma as its ORM. Add a migration that renames the userId column to ownerId."
    );
    expect(result.breakdown.structure).toBe(20);
  });

  test("prompt with no verb, no question, single sentence scores 0 for structure", () => {
    const result = analyzePrompt(
      "Dark mode toggle on the settings page"
    );
    expect(result.breakdown.structure).toBe(0);
    expect(result.feedback).toContain(
      "Start with a clear action verb (e.g. 'Build', 'Create', 'Fix')"
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INTENT
// Rules:
//   Any intentKeyword present → intent = 20
//   None present              → intent = 0, feedback: "Clarify the intent…"
// Keywords: "so that", "in order to", "the goal is", "should", "must",
//   "need to", "want to", "expected", "result", "output", "return",
//   "display", "allow", "prevent", "ensure", "support", "handle"
// ─────────────────────────────────────────────────────────────────────────────

describe("Intent dimension", () => {
  test("'so that' keyword triggers intent score of 20", () => {
    const result = analyzePrompt(
      "Add rate limiting to the API so that each IP is capped at 100 requests per minute"
    );
    expect(result.breakdown.intent).toBe(20);
    expect(result.feedback).not.toContain(
      "Clarify the intent or expected outcome (e.g. 'so that users can...')"
    );
  });

  test("'should' keyword triggers intent score of 20", () => {
    const result = analyzePrompt(
      "Refactor the checkout flow — it should redirect to a confirmation page after payment succeeds"
    );
    expect(result.breakdown.intent).toBe(20);
  });

  test("'must' keyword triggers intent score of 20", () => {
    const result = analyzePrompt(
      "The authentication system must validate JWT tokens on every protected route request"
    );
    expect(result.breakdown.intent).toBe(20);
  });

  test("'in order to' keyword triggers intent score of 20", () => {
    const result = analyzePrompt(
      "Migrate the session store from cookies to Redis in order to support horizontal scaling"
    );
    expect(result.breakdown.intent).toBe(20);
  });

  test("'return' keyword triggers intent score of 20", () => {
    const result = analyzePrompt(
      "Write a TypeScript utility that parses a date string and returns a formatted ISO timestamp"
    );
    expect(result.breakdown.intent).toBe(20);
  });

  test("'ensure' keyword triggers intent score of 20", () => {
    const result = analyzePrompt(
      "Add input validation to the registration form to ensure email addresses are unique"
    );
    expect(result.breakdown.intent).toBe(20);
  });

  test("'handle' keyword triggers intent score of 20", () => {
    const result = analyzePrompt(
      "Update the error boundary to handle network timeouts and show a retry button"
    );
    expect(result.breakdown.intent).toBe(20);
  });

  test("prompt with no intent keyword scores 0 and adds intent feedback", () => {
    const result = analyzePrompt(
      "Rewrite the caching layer using Redis as the storage backend"
    );
    expect(result.breakdown.intent).toBe(0);
    expect(result.feedback).toContain(
      "Clarify the intent or expected outcome (e.g. 'so that users can...')"
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONSTRAINTS
// Rules:
//   Any constraintKeyword present → constraints = 20
//   Any roleKeyword present       → constraints = 20
//   Neither                       → constraints = 0, feedback: "Add constraints…"
// constraintKeywords: "performance", "secure", "security", "scalable",
//   "accessible", "mobile", "responsive", "fast", "lightweight",
//   "no external", "without", "must not", "should not", "existing",
//   "do not change", "keep", "maintain"
// roleKeywords: "as a", "as an", "acting as", "you are"
// ─────────────────────────────────────────────────────────────────────────────

describe("Constraints dimension", () => {
  test("'performance' keyword triggers constraints score of 20", () => {
    const result = analyzePrompt(
      "Optimise the search endpoint for performance so it responds in under 200ms for 10k records"
    );
    expect(result.breakdown.constraints).toBe(20);
    expect(result.feedback).not.toContain(
      "Add constraints (e.g. performance, security, what should NOT change)"
    );
  });

  test("'security' keyword triggers constraints score of 20", () => {
    const result = analyzePrompt(
      "Review the user input handling code and fix any security vulnerabilities before the audit"
    );
    expect(result.breakdown.constraints).toBe(20);
  });

  test("'scalable' keyword triggers constraints score of 20", () => {
    const result = analyzePrompt(
      "Design a scalable job queue system using Redis and BullMQ that supports 1000 jobs per second"
    );
    expect(result.breakdown.constraints).toBe(20);
  });

  test("'responsive' keyword triggers constraints score of 20", () => {
    const result = analyzePrompt(
      "Build a responsive dashboard layout using Tailwind CSS that works on mobile and desktop"
    );
    expect(result.breakdown.constraints).toBe(20);
  });

  test("'without' keyword triggers constraints score of 20", () => {
    const result = analyzePrompt(
      "Add server-side pagination to the users table without breaking the existing filter logic"
    );
    expect(result.breakdown.constraints).toBe(20);
  });

  test("'do not change' keyword triggers constraints score of 20", () => {
    const result = analyzePrompt(
      "Refactor the API layer to use async/await but do not change the public interface signatures"
    );
    expect(result.breakdown.constraints).toBe(20);
  });

  test("'maintain' keyword triggers constraints score of 20", () => {
    const result = analyzePrompt(
      "Migrate the app from Create React App to Vite and maintain full TypeScript support throughout"
    );
    expect(result.breakdown.constraints).toBe(20);
  });

  test("role keyword 'as a' triggers constraints score of 20", () => {
    const result = analyzePrompt(
      "As a senior backend engineer, review this Express middleware and suggest improvements"
    );
    expect(result.breakdown.constraints).toBe(20);
  });

  test("role keyword 'acting as' triggers constraints score of 20", () => {
    const result = analyzePrompt(
      "Acting as a code reviewer, identify any issues with this TypeScript utility function"
    );
    expect(result.breakdown.constraints).toBe(20);
  });

  test("role keyword 'you are' triggers constraints score of 20", () => {
    const result = analyzePrompt(
      "You are a DevOps engineer. Write a GitHub Actions workflow that runs Jest tests on every PR"
    );
    expect(result.breakdown.constraints).toBe(20);
  });

  test("prompt with no constraint or role keyword scores 0 and adds constraints feedback", () => {
    const result = analyzePrompt(
      "Rewrite the image upload handler to use S3 instead of local disk storage"
    );
    expect(result.breakdown.constraints).toBe(0);
    expect(result.feedback).toContain(
      "Add constraints (e.g. performance, security, what should NOT change)"
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION — full end-to-end prompts
// Each test checks: total score, every breakdown dimension, and the
// exact feedback array so regressions in any dimension are caught together.
// ─────────────────────────────────────────────────────────────────────────────

describe("Integration — full prompt scoring", () => {
  test("near-perfect prompt scores 100 with empty feedback", () => {
    // clarity:     20 — 15+ words
    // context:     20 — "typescript", "node"
    // structure:   20 — starts with "build"
    // intent:      20 — "so that"
    // constraints: 20 — "secure", "without"
    const prompt =
      "Build a secure REST API with Node.js and TypeScript that handles user " +
      "authentication so that clients can access protected resources without " +
      "exposing sensitive data to unauthorised callers";

    const result = analyzePrompt(prompt);

    expect(result.score).toBe(100);
    expect(result.breakdown).toEqual({
      clarity: 20,
      context: 20,
      structure: 20,
      intent: 20,
      constraints: 20,
    });
    expect(result.feedback).toHaveLength(0);
  });

  test("vague one-liner scores 0 and returns all five feedback messages", () => {
    // clarity:     0  — < 8 words, no context keyword
    // context:     0  — no tech keyword (avoids 'for','with','in','using')
    // structure:   0  — no verb, no '?', single sentence
    // intent:      0  — no intent keyword
    // constraints: 0  — no constraint or role keyword
    const prompt = "Make the app better";

    const result = analyzePrompt(prompt);

    expect(result.score).toBe(0);
    expect(result.breakdown).toEqual({
      clarity: 0,
      context: 0,
      structure: 0,
      intent: 0,
      constraints: 0,
    });
    expect(result.feedback).toContain("Prompt is too short — describe the full goal");
    expect(result.feedback).toContain(
      "Add context: mention the tech stack, language, or framework"
    );
    expect(result.feedback).toContain(
      "Start with a clear action verb (e.g. 'Build', 'Create', 'Fix')"
    );
    expect(result.feedback).toContain(
      "Clarify the intent or expected outcome (e.g. 'so that users can...')"
    );
    expect(result.feedback).toContain(
      "Add constraints (e.g. performance, security, what should NOT change)"
    );
    expect(result.feedback).toHaveLength(5);
  });

  test("partial prompt (good context + structure, missing intent + constraints) scores 60", () => {
    // clarity:     20 — 15+ words
    // context:     20 — "react", "typescript"
    // structure:   20 — starts with "create"
    // intent:       0 — no intent keyword
    // constraints:  0 — no constraint or role keyword
    const prompt =
      "Create a reusable modal component in React and TypeScript that accepts " +
      "title, body, and onClose props and renders a backdrop overlay";

    const result = analyzePrompt(prompt);

    expect(result.score).toBe(60);
    expect(result.breakdown.clarity).toBe(20);
    expect(result.breakdown.context).toBe(20);
    expect(result.breakdown.structure).toBe(20);
    expect(result.breakdown.intent).toBe(0);
    expect(result.breakdown.constraints).toBe(0);
    expect(result.feedback).toContain(
      "Clarify the intent or expected outcome (e.g. 'so that users can...')"
    );
    expect(result.feedback).toContain(
      "Add constraints (e.g. performance, security, what should NOT change)"
    );
    expect(result.feedback).toHaveLength(2);
  });
});
