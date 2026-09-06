# VS Code Markdown Preview Sample

Open this file via `file://` in Chrome (with the extension loaded and **Allow access to file URLs** enabled).

## Features

- **Bold**, *italic*, `inline code`
- [Anchor link](#math)
- Lists:
  1. One
  2. Two

### Code

```ts
function greet(name: string) {
  return `Hello, ${name}`;
}
```

## Math

Inline: $E = mc^2$

Block:

$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

## Mermaid

```mermaid
flowchart LR
  A[Markdown] --> B[markdown-it]
  B --> C[Preview]
  C --> D[Chrome]
```

## Quote

> Ported from VS Code **Open as Preview**.

| Col A | Col B |
|-------|-------|
| hello | world |

## HTML Elements

<details>
<summary>Click to expand</summary>

Press <kbd>Ctrl</kbd> + <kbd>C</kbd> to copy.

</details>

