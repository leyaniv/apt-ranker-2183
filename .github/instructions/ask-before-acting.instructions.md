---
applyTo: "**"
---

# Ask Before Acting

Before starting any task that is **not** a quick bug fix or a simple rename, you **must** present your questions, suggestions, and proposed approach to the user using the interactive question prompt (the tool that shows selectable options in VS Code).

## When to Ask

- New features or components
- Refactors or restructuring
- Configuration or dependency changes
- Multi-step tasks involving design decisions
- Anything with more than one reasonable approach

## When to Skip

- Quick bug fixes with an obvious single solution
- Simple renames (variable, file, symbol)
- Formatting or lint-only fixes
- Direct, unambiguous one-line changes

## How to Ask

1. **Gather context first** — read relevant files and understand the current state before formulating questions.
2. **Present all questions in a single prompt** — do not drip-feed one question at a time.
3. **Provide predefined options** where choices are finite (e.g., framework, pattern, location).
4. **Always include a freeform text option** (`allowFreeformInput: true`) so the user can supply a custom answer, unless the question strictly requires picking from a closed set.
5. **Keep questions concise** — short header, one-sentence prompt, clear options.

## What to Surface

- Ambiguities in the request
- Alternative approaches worth considering
- Potential side-effects or breaking changes
- Suggested file locations or naming conventions
- Missing information needed to proceed confidently
