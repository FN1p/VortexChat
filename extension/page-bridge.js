/**
 * VortexChat — MAIN World React / Slate.js Bridge for Twitch.tv
 * Runs in the page's MAIN execution context to edit Twitch's chat input once.
 */
(function () {
  if (window.__vortexChatMainBridgeInstalled) return;
  window.__vortexChatMainBridgeInstalled = true;

  function findChatEditorNode() {
    const target = document.querySelector('[data-a-target="chat-input"]');
    if (target) {
      if (target.isContentEditable || target.tagName === 'TEXTAREA') return target;
      const nested = target.querySelector('textarea, [contenteditable="true"], [data-slate-editor="true"]');
      if (nested) return nested;
    }
    return (
      document.querySelector('[data-slate-editor="true"]') ||
      document.querySelector('.chat-wysiwyg-input__editor') ||
      document.querySelector('.chat-input [contenteditable="true"]') ||
      document.querySelector('textarea[data-a-target="chat-input"]')
    );
  }

  function findSendButtonNode() {
    return (
      document.querySelector('[data-a-target="chat-send-button"]') ||
      document.querySelector('button[data-test-selector="chat-send-button"]') ||
      document.querySelector('.chat-input__buttons-container button[type="submit"]')
    );
  }

  function findSlateEditor(editorEl) {
    for (let node = editorEl, steps = 0; node && steps < 4; node = node.parentElement, steps++) {
      const fiberKey = Object.keys(node).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
      let fiber = fiberKey && node[fiberKey];
      for (let depth = 0; fiber && depth < 40; fiber = fiber.return, depth++) {
        const props = fiber.memoizedProps || fiber.pendingProps;
        for (const candidate of [props?.editor, props?.slateEditor]) {
          if (candidate && typeof candidate.insertText === 'function' && typeof candidate.apply === 'function') return candidate;
        }
        for (let state = fiber.memoizedState, index = 0; state && index < 15; state = state.next, index++) {
          const candidate = state.memoizedState;
          if (candidate && typeof candidate.insertText === 'function' && typeof candidate.apply === 'function') return candidate;
        }
      }
    }
    return null;
  }

  function slateTextPoint(nodes, fromEnd, path = []) {
    if (!Array.isArray(nodes)) return null;
    const indexes = nodes.map((_, index) => index);
    if (fromEnd) indexes.reverse();
    for (const index of indexes) {
      const node = nodes[index];
      const nextPath = [...path, index];
      if (typeof node?.text === 'string') return { path: nextPath, offset: fromEnd ? node.text.length : 0 };
      const point = slateTextPoint(node?.children, fromEnd, nextPath);
      if (point) return point;
    }
    return null;
  }

  function placeCaretAtEndOfSlate(editorEl, selectAll) {
    try {
      if (!editorEl.isContentEditable) return false;
      editorEl.focus();
      const sel = window.getSelection();
      if (!sel) return false;

      const range = document.createRange();
      if (selectAll) {
        range.selectNodeContents(editorEl);
      } else {
        const leaves = editorEl.querySelectorAll('[data-slate-string="true"], [data-slate-zero-width]');
        const leaf = leaves[leaves.length - 1];
        const textNode = leaf?.firstChild?.nodeType === 3 ? leaf.firstChild : null;
        if (textNode) {
          range.setStart(textNode, textNode.nodeValue.length);
          range.collapse(true);
        } else {
          range.selectNodeContents(leaf || editorEl);
          range.collapse(false);
        }
      }

      sel.removeAllRanges();
      sel.addRange(range);
      return sel.anchorNode === editorEl || editorEl.contains(sel.anchorNode);
    } catch {
      return false;
    }
  }

  function getEditorCleanText(editorEl) {
    if (!editorEl) return '';
    if (editorEl.tagName && editorEl.tagName.toLowerCase() === 'textarea') {
      return editorEl.value || '';
    }
    return (editorEl.innerText || editorEl.textContent || '').replace(/[\uFEFF\u200B\n\r]/g, '');
  }

  function insertTextNative(rawText, replaceAll) {
    const editorEl = findChatEditorNode();
    if (!editorEl) return false;

    const text = rawText.endsWith(' ') ? rawText : `${rawText} `;
    editorEl.focus();

    // 1. Handle standard <textarea> chat input
    if (editorEl.tagName && editorEl.tagName.toLowerCase() === 'textarea') {
      const current = replaceAll ? '' : (editorEl.value || '');
      const nextValue = current && !current.endsWith(' ') ? `${current} ${text}` : `${current}${text}`;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(editorEl, nextValue);
      } else {
        editorEl.value = nextValue;
      }
      editorEl.dispatchEvent(new Event('input', { bubbles: true }));
      editorEl.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    // One native edit produces one input event. Synthetic paste/beforeinput plus
    // a later fallback could all be handled asynchronously by Twitch's Slate editor.
    try {
      if (!placeCaretAtEndOfSlate(editorEl, Boolean(replaceAll))) return false;
      const beforeText = getEditorCleanText(editorEl);
      const needLeadingSpace = !replaceAll && beforeText.length > 0 && !beforeText.endsWith(' ');
      const payloadText = needLeadingSpace ? ` ${text}` : text;
      const slateEditor = findSlateEditor(editorEl);
      if (slateEditor) {
        const end = slateTextPoint(slateEditor.children, true);
        const start = replaceAll ? slateTextPoint(slateEditor.children, false) : end;
        if (start && end && (!replaceAll || typeof slateEditor.deleteFragment === 'function')) {
          slateEditor.apply({ type: 'set_selection', properties: slateEditor.selection,
            newProperties: { anchor: start, focus: end } });
          if (replaceAll) slateEditor.deleteFragment();
          slateEditor.insertText(payloadText);
          return true;
        }
      }
      document.execCommand('insertText', false, payloadText);
      return true;
    } catch {
      return false;
    }
  }

  let lastSendText = '';
  let lastSendAt = 0;
  function sendTextNative(rawText) {
    const clean = (rawText || '').trim();
    if (!clean) return false;

    const editorEl = findChatEditorNode();
    if (!editorEl) return false;
    const now = performance.now();
    if (lastSendText === clean && now - lastSendAt < 1000) return true;
    if (!insertTextNative(clean, true)) return false;
    lastSendText = clean;
    lastSendAt = now;

    setTimeout(() => {
      if (getEditorCleanText(editorEl).trim() !== clean) {
        lastSendAt = 0;
        return;
      }
      const sendBtn = findSendButtonNode();
      if (sendBtn && !sendBtn.disabled) {
        sendBtn.click();
        return;
      }
      editorEl.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true
      }));
    }, 30);
    return true;
  }

  window.addEventListener('vortex-chat-bridge', (e) => {
    const detail = e.detail;
    if (!detail || typeof detail.text !== 'string') return;
    let handled = false;
    if (detail.type === 'INSERT_TEXT') {
      handled = insertTextNative(detail.text, Boolean(detail.replaceAll));
    } else if (detail.type === 'SEND_TEXT') {
      handled = sendTextNative(detail.text);
    }
    // Synchronous acknowledgement prevents the isolated-world fallback from sending twice.
    window.dispatchEvent(new CustomEvent('vortex-chat-bridge-result', {
      detail: { requestId: detail.requestId, handled }
    }));
  });
})();
