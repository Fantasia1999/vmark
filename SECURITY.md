# Security Policy

## Supported Versions

Only the latest release of **VMark** receives active security updates and vulnerability patches.

| Version | Supported          |
| ------- | ------------------ |
| 0.5.x   | :white_check_mark: |
| < 0.5.0 | :x:                |

---

## Reporting a Vulnerability

We take the security of our users and their data seriously. If you discover a potential security vulnerability, please do **NOT** open a public GitHub issue.

### Preferred Reporting Method

Please report security issues privately via GitHub's Security Advisories:

1. Navigate to the **Security** tab of this repository.
2. Select **Advisories** and click **"Report a vulnerability"**.
3. Provide a detailed description of the issue, reproduction steps, proof of concept, and potential impact.

If GitHub Security Advisories is unavailable, you may contact the maintainer directly through the repository owner's GitHub profile.

### What to Include

To help us investigate and resolve the issue quickly, please provide:
- Type of issue (e.g. XSS, command injection, path traversal, credential leakage)
- Location of the affected code
- Step-by-step instructions to reproduce the vulnerability
- Any sample Markdown, script, or payload used in testing
- Expected vs. actual behavior

### Response Timeline

- **Initial Acknowledgement**: Within 48 hours of report receipt.
- **Triage & Status Update**: Within 7 business days.
- **Fix & Disclosure**: We will coordinate with you on release timing and advisory publication.

---

## Security Architecture & Design Considerations

This project handles several security-sensitive areas by design:

1. **Local Bridge Server (`127.0.0.1`)**:
   - The SSH / WSL bridge binds exclusively to the loopback interface (`127.0.0.1:17823`).
   - Every request requires a random authentication `token` generated upon server startup.
   - Remote execution strictly parameterizes commands with proper shell escaping to prevent injection.

2. **File System Access**:
   - Local directory browsing relies on the browser's File System Access API with explicit user authorization.
   - Path traversals (e.g. `..` escapes) are sanitized and restricted within the authorized workspace root.

3. **HTML Sanitization & SVG Sandbox**:
   - Markdown documents containing embedded HTML are sanitized with **DOMPurify** to strip executable scripts and event handlers.
   - Interactive SVG files are rendered inside a dedicated sandboxed iframe (`viewer/svg-sandbox.html`) to prevent privilege escalation into the extension's execution context.
