# Contributing to Panindigan

Thank you for your interest in contributing to Panindigan! We welcome contributions from the community and are pleased to have you join us.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Pull Requests](#pull-requests)
- [Development Guidelines](#development-guidelines)
  - [Coding Standards](#coding-standards)
  - [Commit Messages](#commit-messages)
  - [Documentation](#documentation)
- [Testing](#testing)
- [Release Process](#release-process)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Create a new branch for your contribution
4. Make your changes
5. Submit a pull request

## Development Setup

### Prerequisites

- Node.js >= 22.0.0
- pnpm (recommended) or npm

### Installation

```bash
# Clone your fork
git clone https://github.com/nazzelofficial/panindigan.git
cd panindigan

# Install dependencies
pnpm install

# Build the project
pnpm run build

# Run linting
pnpm run lint
```

## How to Contribute

### Reporting Bugs

Before creating a bug report, please:

1. Check the [existing issues](https://github.com/nazzelofficial/panindigan/issues) to see if the problem has already been reported
2. Try the latest version to see if the bug has been fixed

When submitting a bug report, please include:

- **Clear title and description**
- **Steps to reproduce** the issue
- **Expected behavior** vs actual behavior
- **Environment details**:
  - Node.js version
  - Operating system
  - Package version
- **Code samples** or test cases that demonstrate the issue
- **Error messages** and stack traces

### Suggesting Features

Feature requests are welcome! Please provide:

- **Clear use case** - What problem does this solve?
- **Detailed description** - How should it work?
- **API design** - What would the interface look like?
- **Examples** - Show how it would be used

### Pull Requests

1. **Create a branch** from `main` with a descriptive name:
   ```bash
   git checkout -b feature/add-message-search
   git checkout -b fix/connection-timeout
   git checkout -b docs/update-readme
   ```

2. **Make your changes** following our coding standards

3. **Test your changes** thoroughly

4. **Update documentation** if needed

5. **Commit your changes** with clear commit messages

6. **Push to your fork**:
   ```bash
   git push origin your-branch-name
   ```

7. **Submit a pull request** with:
   - Clear title and description
   - Reference to any related issues
   - Screenshots or examples if applicable
   - Checklist of what was done

## Development Guidelines

### Coding Standards

We use TypeScript with strict type checking. Please ensure:

- **Type safety**: All functions and variables should have proper types
- **No `any` types**: Avoid using `any` unless absolutely necessary
- **ESM modules**: Use ES module syntax (`import`/`export`)
- **Async/await**: Prefer async/await over callbacks or raw promises
- **Error handling**: Always handle errors appropriately

Example:

```typescript
// Good
async function getUserInfo(userId: string): Promise<User | null> {
  try {
    const response = await this.client.query<UserQuery>({ userId });
    return response.user;
  } catch (error) {
    logger.error('Failed to get user info', error);
    return null;
  }
}

// Bad
function getUserInfo(userId) {
  return this.client.query({ userId }).then(res => res.user);
}
```

### Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Add trailing commas in multi-line objects/arrays
- Maximum line length: 100 characters
- Use meaningful variable names

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Build process or auxiliary tool changes

Examples:

```
feat(messaging): add support for message forwarding

fix(mqtt): resolve reconnection loop on network change

docs(readme): update installation instructions
```

### Documentation

- Update README.md if you change the API
- Add JSDoc comments to public methods
- Include code examples for new features
- Update CHANGELOG.md with your changes

## Testing

While we don't have a full test suite yet, please:

1. **Manual testing**: Test your changes thoroughly
2. **Type checking**: Run `pnpm run lint` to ensure no TypeScript errors
3. **Edge cases**: Consider edge cases and error scenarios
4. **Backward compatibility**: Ensure changes don't break existing functionality

### Test Structure (Future)

When we add tests, they will follow this structure:

```
tests/
├── unit/
│   ├── auth/
│   ├── messaging/
│   └── ...
├── integration/
└── fixtures/
```

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md` with new changes
3. Create a git tag: `git tag v1.0.0`
4. Push tags: `git push --tags`
5. GitHub Actions will automatically publish to npm

## Questions?

If you have questions or need help:

- Open a [GitHub Discussion](https://github.com/nazzelofficial/panindigan/discussions)
- Join our community chat (if available)
- Check existing documentation

## Recognition

Contributors will be recognized in our README.md and releases.

Thank you for contributing to Panindigan!
