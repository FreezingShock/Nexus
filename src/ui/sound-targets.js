// Which element a hover or click should sound for. Buttons and switches always count. Anything else counts when the
// cursor would be a pointer over it (checked a few levels up, so a label inside a row still counts). The town itself
// never counts: the canvas is not a control. Pure: the style lookup is passed in, so the rule is tested in node.
const ALWAYS = 'button, [role="button"], [role="switch"], [role="tab"], [role="option"], summary, label';

export function interactiveAnchor(el, styleOf, levels = 4) {
  let n = el;
  for (let i = 0; n && n.nodeType === 1 && i < levels; i++, n = n.parentElement) {
    if (n.id === 'stage' || n.tagName === 'CANVAS') return null;
    if (n.matches && n.matches(ALWAYS)) return n.disabled ? null : n;
    if (styleOf && styleOf(n) === 'pointer') return n;
  }
  return null;
}
