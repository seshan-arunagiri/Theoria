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
