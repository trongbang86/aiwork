const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character] ?? character));

const inline = (value: string): string => escapeHtml(value)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

/** Small safe Markdown renderer: raw HTML is escaped except exact details/summary wrappers. */
export function renderMarkdown(source: unknown): string {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const output: string[] = [];
  let paragraph: string[] = [], listOpen = false, codeOpen = false, detailsOpen = false;
  const flushParagraph = () => { if (paragraph.length) output.push(`<p>${paragraph.map(inline).join('<br>')}</p>`); paragraph = []; };
  const closeList = () => { if (listOpen) output.push('</ul>'); listOpen = false; };
  for (const line of lines) {
    if (/^```/.test(line)) { flushParagraph(); closeList(); output.push(codeOpen ? '</code></pre>' : '<pre><code>'); codeOpen = !codeOpen; continue; }
    if (codeOpen) { output.push(`${escapeHtml(line)}\n`); continue; }
    if (line === '<details>') { flushParagraph(); closeList(); output.push('<details>'); detailsOpen = true; continue; }
    if (line === '</details>' && detailsOpen) { flushParagraph(); closeList(); output.push('</details>'); detailsOpen = false; continue; }
    const summary = detailsOpen ? line.match(/^<summary>(.+)<\/summary>$/) : null;
    if (summary) { flushParagraph(); output.push(`<summary>${inline(summary[1]!)}</summary>`); continue; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) { flushParagraph(); closeList(); const level = heading[1]!.length; output.push(`<h${level}>${inline(heading[2]!)}</h${level}>`); continue; }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) { flushParagraph(); if (!listOpen) { output.push('<ul>'); listOpen = true; } output.push(`<li>${inline(bullet[1]!)}</li>`); continue; }
    if (!line.trim()) { flushParagraph(); closeList(); continue; }
    paragraph.push(line);
  }
  flushParagraph(); closeList();
  if (codeOpen) output.push('</code></pre>');
  if (detailsOpen) output.push('</details>');
  return output.join('');
}
