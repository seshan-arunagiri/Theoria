# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-08-21
### Added
- Integrated sidebar webview with result, templates, and history tabs.
- Added heuristic scoring engine with real-time feedback across 5 dimensions (clarity, context, structure, intent, constraints).
- Implemented `theoria.refinePrompt`, `theoria.refineSelection`, and `theoria.openPanel` commands.
- Added `CodeActionProvider` for inline prompt refinement via Quick Fixes.
- Integrated OpenRouter API for AI-based prompt generation (supports multiple models).
- Added persistent history tracking for the last 20 refinements.
- Added customizable templates for quick-starting specific prompt formats.

## [0.1.0] - 2026-08-21
### Added
- Initial release with core prompt refinement capabilities.
- Basic framework for analyzing and scoring text inputs.
