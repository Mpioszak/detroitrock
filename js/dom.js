// Tiny helpers shared by the map (app.js) and the data check page (check.js).

// h('a', { class: 'x', href: '...' }, 'text', childNode) -> element.
// Text always goes in as text, never as HTML, so nothing typed into the
// JSON files can break the page.
export function h(tag, attrs, ...kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const kid of kids.flat()) {
    if (kid !== null && kid !== undefined && kid !== false) node.append(kid);
  }
  return node;
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
