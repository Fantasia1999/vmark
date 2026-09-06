# Third-Party Notices

## Visual Studio Code (Microsoft)

Portions of this project (markdown engine behavior, preview CSS, KaTeX/Mermaid plugin integration patterns) are derived from:

- https://github.com/microsoft/vscode  
- Copyright (c) Microsoft Corporation  
- License: MIT  

Relevant upstream packages:

- `extensions/markdown-language-features`
- `extensions/markdown-math`
- `extensions/mermaid-markdown-features`

## Other runtime dependencies

See `package.json` / `package-lock.json` for versions of:

- markdown-it (MIT)
- highlight.js (BSD-3-Clause)
- katex / @vscode/markdown-it-katex (MIT)
- mermaid (MIT)
- dompurify (Apache-2.0 or MPL-2.0)
- ssh2 (MIT, used in `ssh-bridge`)
