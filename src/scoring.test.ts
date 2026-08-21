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
