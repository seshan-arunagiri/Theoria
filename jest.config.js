/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  // Use ts-jest to transform TypeScript files
  preset: "ts-jest",

  // Node environment — matches the VS Code extension host and tsconfig target ES6/commonjs
  testEnvironment: "node",

  // Only look for tests inside src/; ignore compiled output and node_modules
  roots: ["<rootDir>/src"],

  // Match *.test.ts and *.spec.ts files
  testMatch: ["**/*.test.ts", "**/*.spec.ts"],

  // ts-jest transformer options — mirrors tsconfig.json settings
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          // Keep in sync with tsconfig.json
          module: "commonjs",
          target: "ES6",
          strict: true,
        },
      },
    ],
  },

  // Show individual test names in the run output
  verbose: true,
};
