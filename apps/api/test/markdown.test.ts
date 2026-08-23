import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/markdown.js';

describe('safe work-item Markdown', () => {
  it('renders common prose and expandable details', () => {
    const html = renderMarkdown('# Story\n\n- one\n- **two**\n\n<details>\n<summary>Full result</summary>\n\n`done`\n\n</details>');
    expect(html).toContain('<h1>Story</h1>');
    expect(html).toContain('<li><strong>two</strong></li>');
    expect(html).toContain('<details><summary>Full result</summary>');
    expect(html).toContain('<code>done</code>');
  });

  it('escapes arbitrary HTML and only links http URLs', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n[bad](javascript:alert(1))');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:');
  });
});
