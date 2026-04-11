export interface ScoreResult {
    score: number;
    breakdown: {
        clarity: number;
        context: number;
        structure: number;
        intent: number;
        constraints: number;
    };
    feedback: string[];
}

export function analyzePrompt(prompt: string): ScoreResult {
    const lower = prompt.toLowerCase().trim();
    const words = lower.split(/\s+/).filter(Boolean);
    const sentences = prompt.split(/[.!?]+/).filter(s => s.trim().length > 0);

    let clarity = 0;
    let context = 0;
    let structure = 0;
    let intent = 0;
    let constraints = 0;
    const feedback: string[] = [];

    // CLARITY — sentence length + word variety
    if (words.length >= 15) {
        clarity = 20;
    } else if (words.length >= 8) {
        clarity = 10;
        feedback.push("Add more detail to improve clarity (aim for 15+ words)");
    } else {
        feedback.push("Prompt is too short — describe the full goal");
    }

    // CONTEXT — tech stack, framework, language mentions
    const contextKeywords = ["react", "typescript", "javascript", "python", "node", "next", "vue",
        "angular", "express", "django", "api", "backend", "frontend", "database", "sql",
        "mongodb", "aws", "docker", "rest", "graphql", "for", "using", "with", "in"];
    const hasContext = contextKeywords.some(k => lower.includes(k));
    if (hasContext) {
        context = 20;
    } else {
        feedback.push("Add context: mention the tech stack, language, or framework");
    }

    // STRUCTURE — question form, imperative verbs, multi-sentence
    const structureVerbs = ["create", "build", "implement", "add", "fix", "refactor",
        "generate", "design", "write", "update", "remove", "migrate"];
    const hasVerb = structureVerbs.some(v => lower.startsWith(v) || lower.includes(` ${v} `));
    const isQuestion = lower.includes("?") || lower.startsWith("how") || lower.startsWith("what");
    const isMultiSentence = sentences.length >= 2;
    if (hasVerb || isQuestion || isMultiSentence) {
        structure = 20;
    } else {
        feedback.push("Start with a clear action verb (e.g. 'Build', 'Create', 'Fix')");
    }

    // INTENT — explicit outcome or deliverable
    const intentKeywords = ["so that", "in order to", "the goal is", "should", "must",
        "need to", "want to", "expected", "result", "output", "return", "display",
        "allow", "prevent", "ensure", "support", "handle"];
    const hasIntent = intentKeywords.some(k => lower.includes(k));
    if (hasIntent) {
        intent = 20;
    } else {
        feedback.push("Clarify the intent or expected outcome (e.g. 'so that users can...')");
    }

    // CONSTRAINTS — non-functional requirements
    const constraintKeywords = ["performance", "secure", "security", "scalable", "accessible",
        "mobile", "responsive", "fast", "lightweight", "no external", "without",
        "must not", "should not", "existing", "do not change", "keep", "maintain"];
    const hasConstraints = constraintKeywords.some(k => lower.includes(k));

    // Role-based prompts also count as constraints
    const roleKeywords = ["as a", "as an", "acting as", "you are"];
    const hasRole = roleKeywords.some(k => lower.includes(k));

    if (hasConstraints || hasRole) {
        constraints = 20;
    } else {
        feedback.push("Add constraints (e.g. performance, security, what should NOT change)");
    }

    const score = clarity + context + structure + intent + constraints;

    return {
        score,
        breakdown: { clarity, context, structure, intent, constraints },
        feedback
    };
}
