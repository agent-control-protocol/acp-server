# Contributing to @acprotocol/server

Thank you for your interest in contributing to the ACP reference server. This guide covers everything you need to get started.

Please review our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## Getting Started

```bash
git clone https://github.com/agent-control-protocol/acp-server.git
cd acp-server
npm install
npm test
```

To run the server locally during development:

```bash
npm run dev
```

## Development Workflow

1. Fork the repository and clone your fork.
2. Create a feature branch from `main` (`git checkout -b my-feature`).
3. Make your changes.
4. Run the full test suite: `npm test`.
5. Verify formatting: `npm run format:check`.
6. Ensure the project compiles: `npm run build`.
7. Commit your changes and push to your fork.
8. Open a pull request against `main`.

## Code Style

- **Prettier** is enforced for all source files. Run `npm run format:check` to verify.
- **TypeScript strict mode** is enabled -- do not weaken compiler options.
- **ESM only** -- use `import`/`export`, not `require`/`module.exports`.
- Keep public APIs documented with JSDoc comments.

## Testing

All pull requests must pass the existing test suite (Vitest, 211+ tests):

```bash
npm test                # run all tests
npm run test:coverage   # run tests with coverage report
```

- Coverage thresholds are enforced at 85% for statements, branches, functions, and lines.
- Add tests for every new feature or bug fix.
- Conformance tests validate against the ACP v1 JSON Schema -- do not skip them.

## Pull Request Requirements

- Provide a clear description of what the PR does and why.
- All tests pass (`npm test`).
- Coverage thresholds are maintained (`npm run test:coverage`).
- TypeScript compiles without errors (`npm run build`).
- Formatting passes (`npm run format:check`).
- Keep PRs focused -- one concern per pull request.

## Reporting Issues

- Search [existing issues](https://github.com/agent-control-protocol/acp-server/issues) before opening a new one.
- Use the provided issue templates when available.
- Include steps to reproduce, expected behavior, and actual behavior.

## Getting Help

For questions, design discussions, or general conversation about ACP, visit
[GitHub Discussions](https://github.com/agent-control-protocol/acp/discussions).

## License

By contributing, you agree that your contributions will be licensed under the
[Apache License 2.0](LICENSE), the same license that covers this project.
