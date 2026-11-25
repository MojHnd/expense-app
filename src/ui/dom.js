// Small DOM helpers. All text goes in through text nodes, never through innerHTML.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  setProps(el, props);
  append(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function s(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function setProps(el, props) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/**
 * Open the bottom sheet. `build(close)` returns the sheet content.
 * Resolves with the value given to close(value) (undefined when dismissed).
 */
export function openSheet(build) {
  const dialog = document.getElementById('sheet');
  return new Promise((resolve) => {
    let done = false;
    const close = (value) => {
      if (done) return;
      done = true;
      dialog.close();
      resolve(value);
    };
    dialog.replaceChildren(build(close));
    // The close event comes later as a task. If a new sheet is open by then, the event is old: ignore it.
    dialog.onclose = () => { if (!dialog.open) close(undefined); };
    // Close on a tap on the backdrop only. A tap on the dialog padding also has the dialog as target,
    // so compare the position with the dialog box.
    dialog.onclick = (e) => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) close(undefined);
    };
    dialog.showModal();
    const focus = dialog.querySelector('[autofocus]');
    if (focus) setTimeout(() => focus.focus(), 50);
  });
}

export function sheetIsOpen() {
  return document.getElementById('sheet').open;
}

/** A yes/no question in the sheet. Resolves true or false. */
export async function confirmSheet({ title, message, yes = 'OK', no = 'Cancel', danger = false }) {
  const answer = await openSheet((close) => h('div', null,
    h('div', { class: 'sheet-head' }, h('h2', null, title)),
    message ? h('p', { class: 'muted' }, message) : null,
    h('div', { class: 'sheet-actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, no),
      h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', onclick: () => close(true) }, yes)),
  ));
  return answer === true;
}

export function segmented(options, current, onChange) {
  const wrap = h('div', { class: 'segmented', role: 'group' });
  for (const [value, label] of options) {
    wrap.append(h('button', {
      type: 'button',
      'aria-pressed': String(value === current),
      onclick: () => {
        for (const b of wrap.children) b.setAttribute('aria-pressed', 'false');
        wrap.querySelector(`[data-value="${CSS.escape(value)}"]`).setAttribute('aria-pressed', 'true');
        onChange(value);
      },
      dataset: { value },
    }, label));
  }
  return wrap;
}
