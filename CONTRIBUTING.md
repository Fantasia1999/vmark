# Contributing to VS Code Markdown Preview

Thank you for your interest in contributing to **VS Code Markdown Preview**!

This project brings the pixel-perfect VS Code Markdown preview experience to Google Chrome, supporting local folders, remote SSH servers, WSL distributions, and standalone files.

We welcome bug reports, feature suggestions, documentation improvements, and code contributions.

---

## Code of Conduct

Please review and adhere to our [Code of Conduct](CODE_OF_CONDUCT.md) in all project interactions.

---

## Development Setup

### Prerequisites

- **Node.js**: v20.x or v22.x (LTS recommended)
- **npm**: v10+
- **Google Chrome** (or Chromium-based browser)

### Getting Started

1. **Fork and clone the repository**:
   ```bash
   git clone https://github.com/<your-username>/vscode-md-preview.git
   cd vscode-md-preview
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the extension**:
   ```bash
   # Build once for production
   npm run build

   # Or run with watch mode during development
   npm run dev
   ```

4. **Load into Google Chrome**:
   1. Open `chrome://extensions/` in Chrome.
   2. Turn on **Developer mode** in the upper-right corner.
   3. Click **Load unpacked** and select the `dist/` directory.
   4. **Important**: Click **Details** on the extension card and toggle on **"Allow access to file URLs"** (required for previewing local files).

5. **(Optional) Local Bridge for SSH & WSL**:
   ```bash
   # Install bridge dependencies
   npm run ssh-bridge:install

   # Start bridge server on 127.0.0.1:17823
   npm run ssh-bridge
   ```

---

## Testing & Verification

Before submitting a Pull Request, please ensure all checks pass:

```bash
# Static type checking
npm run typecheck

# Unit test suite (120+ tests)
npm test

# Smoke rendering verification
npm run smoke
```

Optional End-to-End Tests:
```bash
# Runs Playwright browser integration tests
npm run test:e2e
```

---

## Project Structure

```
├── dist/                # Build output (loaded as unpacked extension)
├── fixtures/            # Sample markdown test fixtures
├── public/              # Static assets (icons)
├── scripts/             # Build, test, icon generation, and diagnostic scripts
├── src/                 # TypeScript source code
│   ├── background/      # Chrome Extension service worker
│   ├── content/         # In-page auto-preview content scripts
│   ├── options/         # Extension options and settings page
│   ├── popup/           # Extension toolbar popup
│   ├── preview/         # Core Markdown rendering engine, plugins & styles
│   ├── shared/          # Utility modules, bridge clients, mime helpers
│   └── viewer/          # Full-page Markdown Workbench UI
├── ssh-bridge/          # Local HTTP bridge for SSH and WSL integration
└── test/                # Automated unit and integration tests
```

---

## Commit Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` A new feature
- `fix:` A bug fix
- `docs:` Documentation changes
- `style:` Formatting or UI styling changes that do not affect logic
- `refactor:` Code refactoring without behavioral change
- `test:` Adding or updating tests
- `chore:` Maintenance, dependency updates, build tooling

Example:
```bash
git commit -m "feat(viewer): add zoom controls to toolbar"
```

---

## Pull Request Workflow

1. Create a descriptive feature branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Implement your changes, following existing coding patterns and formatting conventions.
3. Write or update tests to cover new functionality or bug fixes.
4. Verify that `npm run typecheck`, `npm test`, and `npm run smoke` pass cleanly.
5. Push to your fork and submit a Pull Request to the `main` branch.
6. A maintainer will review your contribution. Thank you for making this project better!
