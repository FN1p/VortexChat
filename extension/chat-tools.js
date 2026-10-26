/* Reading tools use a frozen view while Twitch keeps receiving messages underneath. */
(function (root) {
  'use strict';
  const LINE = '.chat-line__message, [data-a-target="chat-line-message"]';
  const USER = '[data-a-target="chat-message-username"], .chat-line__username';
  function enhanceDialog(overlay, label) {
    const previous = document.activeElement;
    const close = (restore = true) => {
      overlay.remove();
      if (restore && previous?.isConnected) previous.focus();
    };
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', label);
    const focusable = () => [...overlay.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select')]
      .filter(node => node.getClientRects().length);
    overlay.addEventListener('vortex-close-dialog', () => close());
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      const first = nodes[0];
      const last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    focusable()[0]?.focus();
    return close;
  }
  function create(options) {
    const history = new VortexCore.MessageHistory();
    const records = new WeakMap();
    let nextId = 0;
    let list = null;
    let scroller = null;
    let paused = null;
    let card = null;
    let pauseButton = null;
    let speedBadge = null;
    let speedTimes = [];
    let speedKnown = new WeakMap();
    let initialLines = new WeakSet();
    let resumedUnderPointer = false;

    function button(label, action, className = '') {
      const node = document.createElement('button');
      node.type = 'button';
      node.textContent = label;
      node.className = className;
      node.addEventListener('click', action);
      return node;
    }

    function findScroller(node) {
      for (let parent = node; parent && parent !== document.body; parent = parent.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) return parent;
      }
      return node;
    }

    function background(node) {
      for (let parent = node; parent; parent = parent.parentElement) {
        const color = getComputedStyle(parent).backgroundColor;
        if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color;
      }
      return '#18181b';
    }

    function positionPause() {
      if (!paused) return;
      if (!scroller?.isConnected) return resume(false);
      const rect = scroller.getBoundingClientRect();
      Object.assign(paused.view.style, { top: `${rect.top}px`, left: `${rect.left}px`,
        width: `${rect.width}px`, height: `${rect.height}px` });
    }

    function updatePause() {
      if (pauseButton) {
        pauseButton.textContent = paused ? '▶' : 'Ⅱ';
        pauseButton.setAttribute('aria-label', paused ? 'Продолжить чат' : 'Приостановить чат');
        pauseButton.title = paused ? 'Продолжить чат' : 'Приостановить чат';
        pauseButton.setAttribute('aria-pressed', String(Boolean(paused)));
      }
      if (paused) paused.counter.textContent = paused.count ? `На паузе · новых: ${paused.count}` : 'Чат на паузе';
    }

    function pause(reason = 'manual') {
      if (paused) { if (reason === 'manual') paused.reason = reason; return; }
      if (!list?.isConnected || !scroller) return;
      const source = list.cloneNode(true);
      source.style.padding = getComputedStyle(list).padding;
      source.classList.remove('chat-scrollable-area__message-container');
      source.removeAttribute('id');
      source.removeAttribute('data-a-target');
      source.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      source.querySelectorAll(LINE).forEach(node => {
        node.classList.remove('chat-line__message');
        node.removeAttribute('data-a-target');
      });
      source.querySelectorAll('.vortex-zw-stack').forEach(stack => {
        stack.addEventListener('click', () => options.openEmote?.(stack.querySelector('.vortex-chat-emote')?.alt));
        stack.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); stack.click(); }
        });
      });
      const view = document.createElement('section');
      view.className = 'vortex-paused-view';
      view.setAttribute('aria-label', 'Приостановленный чат');
      view.style.backgroundColor = background(scroller);
      view.style.color = getComputedStyle(scroller).color;
      const scroll = document.createElement('div');
      scroll.className = 'vortex-paused-scroll';
      scroll.tabIndex = 0;
      scroll.setAttribute('aria-label', 'Сообщения на паузе');
      scroll.appendChild(source);
      const toolbar = document.createElement('div');
      toolbar.className = 'vortex-pause-toolbar';
      const counter = document.createElement('span');
      // Avoid repeatedly announcing fast chat to screen readers; the button exposes the count.
      toolbar.append(counter, button('К эфиру ↓', () => resume(), 'vortex-tool-button'));
      view.append(scroll, toolbar);
      const known = new WeakMap([...list.querySelectorAll(LINE)].map(line => [line, records.get(line)?.id || line.getAttribute('data-id') || 'existing']));
      paused = { view, scroll, counter, reason, known, count: 0, channel: options.channel(), originalAria: scroller.getAttribute('aria-hidden'), originalInert: scroller.inert };
      scroller.setAttribute('aria-hidden', 'true');
      scroller.inert = true;
      document.body.appendChild(view);
      positionPause();
      // Match the native viewport, including any content preceding the message list.
      const offset = list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroll.scrollTop = Math.max(0, scroller.scrollTop - offset);
      updatePause();
    }

    function resume(toBottom = true) {
      if (!paused) return;
      paused.view.remove();
      if (scroller) {
        scroller.inert = paused.originalInert;
        if (paused.originalAria === null) scroller.removeAttribute('aria-hidden');
        else scroller.setAttribute('aria-hidden', paused.originalAria);
      }
      paused = null;
      resumedUnderPointer = true;
      if (toBottom && scroller?.isConnected) scroller.scrollTop = scroller.scrollHeight;
      updatePause();
    }

    function hoverStart() {
      if (options.settings().pauseOnHover && !resumedUnderPointer) pause('hover');
    }

    function attach(nextList) {
      if (list === nextList) return;
      closePreview();
      resume(false);
      list?.removeEventListener('mouseenter', hoverStart);
      list = nextList;
      speedTimes = [];
      speedKnown = new WeakMap();
      initialLines = new WeakSet(list?.querySelectorAll(LINE) || []);
      scroller = list ? findScroller(list) : null;
      resumedUnderPointer = false;
      list?.addEventListener('mouseenter', hoverStart);
    }

    function capture(line, at, capturedText) {
      const username = line.querySelector(USER);
      if (!username) return;
      const user = (username.getAttribute('data-a-user') || username.getAttribute('data-user') || username.textContent || '').trim();
      const channel = options.channel();
      const text = capturedText ?? options.getText(line);
      const old = records.get(line);
      let id = line.getAttribute('data-id') || line.getAttribute('data-message-id') || old?.id || `local-${++nextId}`;
      if (old && old.channel !== channel && old.id === id) {
        if (old.text === text && old.user === user) return;
        id = `local-${++nextId}`;
      }
      const changed = !old || old.id !== id || old.text !== text || old.user !== user || old.channel !== channel;
      if (speedKnown.get(line) !== id) {
        speedKnown.set(line, id);
        if (!initialLines.has(line)) speedTimes.push(Date.now());
        initialLines.delete(line);
      }
      if (changed) {
        const record = { id, channel, user, text, at: old && old.id !== id ? new Date().toISOString() : at.toISOString() };
        records.set(line, record);
        history.add(channel, record);
        if (card?.user.toLocaleLowerCase() === user.toLocaleLowerCase() && card.channel === channel) renderHistory();
      }
      if (paused && paused.known.get(line) !== id) {
        paused.known.set(line, id);
        paused.count++;
        updatePause();
      }
      let open = line.querySelector('.vortex-user-history-button');
      if (!open) {
        open = button('≡', () => {}, 'vortex-user-history-button');
        open.dataset.vortexUser = user;
        open.dataset.vortexChannel = channel;
        open.setAttribute('aria-label', `История сообщений ${user}`);
        open.title = `История сообщений ${user}`;
        (username.closest('button') || username).insertAdjacentElement('afterend', open);
      }
      if (open.dataset.vortexUser !== user || open.dataset.vortexChannel !== channel) {
        open.dataset.vortexUser = user;
        open.dataset.vortexChannel = channel;
        open.setAttribute('aria-label', `История сообщений ${user}`);
        open.title = `История сообщений ${user}`;
      }
      let copy = line.querySelector('.vortex-message-copy');
      if (!copy) {
        copy = button('⧉', () => {}, 'vortex-message-copy');
        copy.title = 'Копировать сообщение';
        copy.setAttribute('aria-label', `Копировать сообщение ${user}`);
      }
      // Twitch has an absolutely positioned controls area. A control added to
      // the message flow can wrap onto its own line and double the row height.
      const controls = line.querySelector('.chat-line__icons');
      if (controls) {
        if (copy.parentElement !== controls) controls.appendChild(copy);
      } else if (open.nextElementSibling !== copy) open.insertAdjacentElement('afterend', copy);
      if (copy.dataset.vortexCopy !== text) copy.dataset.vortexCopy = text;
      copy.setAttribute('aria-label', `Копировать сообщение ${user}`);
      // Quote locally in the editor; never send chat messages without user action.
      let quote = line.querySelector('.vortex-message-quote');
      if (!quote) {
        quote = button('↩', () => {}, 'vortex-message-quote');
        quote.title = 'Цитировать в ответе';
      }
      quote.dataset.vortexUser = user;
      quote.dataset.vortexText = String(text || '').slice(0, 220);
      quote.setAttribute('aria-label', 'Цитировать сообщение ' + user);
      if (controls) {
        if (quote.parentElement !== controls) controls.appendChild(quote);
      } else if (copy.nextElementSibling !== quote) copy.insertAdjacentElement('afterend', quote);

      copy.hidden = !options.settings().showCopyButton;
    }

    function closeCard() {
      if (!card) return;
      const restore = card.restore;
      card.overlay.remove();
      card = null;
      if (restore?.isConnected) restore.focus();
    }

    // Use Twitch's native message selectors; preview works before Vortex enhances the row.
    let preview = null;
    let previewTimer = null;
    let hoveredName = null;
    const previewSelector = '[data-a-target="chat-message-username"], .chat-line__username';
    const previewRowSelector = '.chat-line__message, [data-a-target="chat-line-message"], .vortex-chat-line';
    function clearPreviewTimer() {
      if (previewTimer !== null) clearTimeout(previewTimer);
      previewTimer = null;
    }
    function closePreview() {
      clearPreviewTimer();
      hoveredName = null;
      preview?.remove();
      preview = null;
    }
    function previewUser(name, target) {
      clearPreviewTimer();
      if (card || hoveredName !== target || !target?.isConnected || !/^[a-z0-9_]{1,25}$/i.test(name)) return;
      preview?.remove();
      const box = document.createElement('section');
      box.className = 'vortex-user-preview';
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', 'Быстрые действия: ' + name);
      const heading = document.createElement('strong');
      heading.textContent = name;
      const actions = document.createElement('div');
      const mention = button('@ Упомянуть', () => {
        if (!options.insertText('@' + name + ' ')) options.toast('Поле ввода Twitch недоступно');
        closePreview();
      }, 'vortex-tool-button');
      const historyAction = button('История', () => {
        closePreview();
        openCard(name, options.channel(), target);
      }, 'vortex-tool-button');
      actions.append(mention, historyAction);
      // Show a bounded preview from messages already observed on this tab.
      const recent = history.forUser(options.channel(), name).slice(-3);
      const latest = document.createElement('div');
      latest.className = 'vortex-user-preview-messages';
      const sectionLabel = document.createElement('span');
      sectionLabel.className = 'vortex-user-preview-label';
      sectionLabel.textContent = 'Последние сообщения · ' + recent.length;
      latest.appendChild(sectionLabel);
      if (!recent.length) {
        const empty = document.createElement('p');
        empty.textContent = 'Сообщений в текущей вкладке пока нет';
        latest.appendChild(empty);
      } else {
        for (const entry of recent) {
          const line = document.createElement('p');
          line.textContent = String(entry.text || '').slice(0, 240);
          line.title = String(entry.text || '');
          latest.appendChild(line);
        }
      }
      box.append(heading, latest, actions);
      box.addEventListener('pointerenter', clearPreviewTimer);
      box.addEventListener('pointerleave', closePreview);
      document.body.appendChild(box);
      const rect = target.getBoundingClientRect();
      const width = box.offsetWidth;
      const height = box.offsetHeight;
      box.style.left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left)) + 'px';
      // Prefer directly underneath the username, where the pointer can reach the actions.
      const below = rect.bottom + 4;
      box.style.top = (below + height <= window.innerHeight - 8 ? below : Math.max(8, rect.top - height - 4)) + 'px';
      preview = box;
    }
    document.addEventListener('pointerover', event => {
      if (event.pointerType === 'touch' || card || preview?.contains(event.target)) return;
      const node = event.target.closest?.(previewSelector);
      if (!node?.closest(previewRowSelector) || !node.closest('body')) return;
      if (node.contains(event.relatedTarget)) return;
      const name = (node.getAttribute('data-a-user') || node.getAttribute('data-user') || node.textContent || '').trim();
      if (!/^[a-z0-9_]{1,25}$/i.test(name)) return;
      if (hoveredName === node && preview) return;
      clearPreviewTimer();
      hoveredName = node;
      previewTimer = setTimeout(() => previewUser(name, node), 280);
    }, true);
    document.addEventListener('pointerout', event => {
      const node = event.target.closest?.(previewSelector);
      if (!node?.closest(previewRowSelector) || node.contains(event.relatedTarget)) return;
      clearPreviewTimer();
      previewTimer = setTimeout(() => {
        if (!preview?.matches(':hover')) closePreview();
      }, 320);
    }, true);
    function renderHistory() {
      if (!card) return;
      const entries = history.forUser(card.channel, card.user, card.search.value);
      const previousScroll = card.messages.scrollTop;
      const previousHeight = card.messages.scrollHeight;
      const focusedId = card.messages.contains(document.activeElement) ? document.activeElement.closest('[data-history-id]')?.dataset.historyId : null;
      card.messages.replaceChildren();
      card.count.textContent = `Сообщения пользователя: ${entries.length} · #${card.channel}`;
      if (!entries.length) {
        const empty = document.createElement('p');
        empty.className = 'vortex-history-empty';
        empty.textContent = 'Нет сообщений. История собирается только во время работы этой вкладки.';
        card.messages.appendChild(empty);
      }
      entries.forEach(entry => {
        const row = document.createElement('article');
        row.className = 'vortex-history-message';
        row.dataset.historyId = entry.id;
        const time = document.createElement('time');
        time.dateTime = entry.at;
        time.textContent = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const text = document.createElement('p');
        text.textContent = entry.text;
        const copy = button('Копировать', async () => {
          try { await navigator.clipboard.writeText(entry.text); options.toast('Сообщение скопировано'); }
          catch { options.toast('Не удалось скопировать. Текст можно выделить вручную.'); }
        }, 'vortex-history-copy');
        row.append(time, text, copy);
        card.messages.appendChild(row);
      });
      if (focusedId) [...card.messages.children].find(row => row.dataset.historyId === focusedId)?.querySelector('button')?.focus({ preventScroll: true });
      if (previousScroll > 20) card.messages.scrollTop = previousScroll + card.messages.scrollHeight - previousHeight;
    }

    function openCard(user, channel, trigger) {
      closePreview();
      closeCard();
      const overlay = document.createElement('div');
      overlay.className = 'vortex-user-card-overlay';
      const dialog = document.createElement('section');
      dialog.className = 'vortex-user-card';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'vortex-user-card-title');
      const header = document.createElement('header');
      const title = document.createElement('h2');
      title.id = 'vortex-user-card-title';
      title.textContent = user;
      const close = button('×', closeCard, 'vortex-tool-button');
      close.setAttribute('aria-label', 'Закрыть историю пользователя');
      header.append(title, close);
      const info = document.createElement('p');
      info.className = 'vortex-history-note';
      info.textContent = 'Сообщения, замеченные этой вкладкой. История хранится в памяти, до 1200 сообщений на канал; показаны последние 100 совпадений.';
      const actions = document.createElement('div');
      actions.className = 'vortex-user-actions';
      const validLogin = /^[a-z0-9_]{1,25}$/i.test(user);
      const mention = button('@ Упомянуть', () => {
        if (options.insertText(`@${user} `)) closeCard();
        else options.toast('Поле ввода Twitch недоступно');
      }, 'vortex-tool-button');
      mention.disabled = !validLogin;
      actions.appendChild(mention);
      // Local-only quick actions: no account lookup or external service.
      const copyUsername = button('Копировать ник', async () => {
        if (!validLogin) return;
        try { await navigator.clipboard.writeText(user); options.toast('Ник скопирован'); }
        catch { options.toast('Не удалось скопировать ник'); }
      }, 'vortex-tool-button');
      copyUsername.disabled = !validLogin;
      actions.appendChild(copyUsername);
      const highlightedUsers = String(options.settings().highlightUsers || '').split(',').map(part => part.trim()).filter(Boolean);
      const alreadyHighlighted = highlightedUsers.some(part => part.toLowerCase() === user.toLowerCase());
      const highlightAction = button(alreadyHighlighted ? 'Убрать подсветку' : 'Подсвечивать ник', () => {
        if (!validLogin) return;
        const current = String(options.settings().highlightUsers || '').split(',').map(part => part.trim()).filter(Boolean);
        const exists = current.some(part => part.toLowerCase() === user.toLowerCase());
        const next = exists ? current.filter(part => part.toLowerCase() !== user.toLowerCase()) : [...current, user];
        if (next.join(', ').length > 500) { options.toast('Список подсветки заполнен'); return; }
        options.saveSettings?.({ highlightUsers: next.join(', ') });
        // Update current visible rows without waiting for another chat message.
        list?.querySelectorAll(LINE).forEach(row => {
          const username = row.querySelector(USER);
          const login = (username?.getAttribute('data-a-user') || username?.getAttribute('data-user') || username?.textContent || '').trim();
          if (login.toLowerCase() !== user.toLowerCase()) return;
          if (!exists) row.classList.add('vortex-highlight-line');
          else row.classList.remove('vortex-highlight-line');
        });
        closeCard();
        options.toast(exists ? 'Подсветка ника выключена' : 'Подсветка ника включена');
      }, 'vortex-tool-button');
      highlightAction.disabled = !validLogin || typeof options.saveSettings !== 'function';
      actions.appendChild(highlightAction);
      const findNativeUsername = () => [...(list?.querySelectorAll(USER) || [])].find(node =>
        (node.getAttribute('data-a-user') || node.getAttribute('data-user') || node.textContent || '').trim().toLocaleLowerCase() === user.toLocaleLowerCase());
      const nativeCard = button('Карточка Twitch', () => {
        const native = findNativeUsername();
        if (!native) { options.toast('Пользователя больше нет в видимой ленте'); return; }
        resume(false);
        closeCard();
        passThroughNativeUserClick = true;
        try { (native.closest('button') || native).click(); }
        finally { passThroughNativeUserClick = false; }
      }, 'vortex-tool-button');
      nativeCard.disabled = !findNativeUsername();
      nativeCard.title = 'Открыть встроенную карточку Twitch с доступными действиями';
      actions.appendChild(nativeCard);
      if (validLogin) {
        const profile = document.createElement('a');
        profile.href = `https://www.twitch.tv/${encodeURIComponent(user)}`;
        profile.target = '_blank';
        profile.rel = 'noopener noreferrer';
        profile.className = 'vortex-tool-button';
        profile.textContent = 'Профиль Twitch ↗';
        actions.appendChild(profile);
      }
      const search = document.createElement('input');
      search.type = 'search';
      search.placeholder = 'Поиск по сообщениям';
      search.setAttribute('aria-label', 'Поиск по истории пользователя');
      search.maxLength = 200;
      search.addEventListener('input', renderHistory);
      search.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); card?.messages.querySelector('button')?.focus(); }
      });
      const count = document.createElement('p');
      count.className = 'vortex-history-note';
      const copyHistory = button('Копировать историю', async () => {
        // Export only the bounded, already-observed messages for this user/channel.
        const entries = history.forUser(channel, user, search.value);
        if (!entries.length) { options.toast('Нет сообщений для копирования'); return; }
        const text = entries.map(entry => '[' + String(entry.at || '') + '] ' + user + ': ' + String(entry.text || '')).join('\n');
        try { await navigator.clipboard.writeText(text); options.toast('История скопирована'); }
        catch { options.toast('Не удалось скопировать историю'); }
      }, 'vortex-tool-button');
      actions.appendChild(copyHistory);
      const messages = document.createElement('div');
      messages.className = 'vortex-history-list';
      const historyHeading = document.createElement('h3');
      historyHeading.className = 'vortex-user-history-heading';
      historyHeading.textContent = 'Что писал ' + user;
      dialog.append(header, info, actions, historyHeading, search, count, messages);
      overlay.appendChild(dialog);
      overlay.addEventListener('click', event => { if (event.target === overlay) closeCard(); });
      card = { overlay, user, channel, search, count, messages, restore: trigger || document.activeElement };
      document.body.appendChild(overlay);
      renderHistory();
      search.focus();
    }

    function mountHeader(group) {
      speedBadge = document.createElement('span');
      speedBadge.className = 'vortex-chat-speed';
      speedBadge.setAttribute('aria-hidden', 'true');
      group.appendChild(speedBadge);
      pauseButton = button('Ⅱ', () => paused ? resume() : pause(), 'seventv-header-btn');
      pauseButton.dataset.vortexPause = 'true';
      group.appendChild(pauseButton);
      updatePause();
    }

    function maintain() {
      if (paused && (paused.channel !== options.channel() || (paused.reason === 'hover' && !options.settings().pauseOnHover))) resume(false);
      if (card && card.channel !== options.channel()) closeCard();
      positionPause();
      if (speedBadge) {
        const cutoff = Date.now() - 10000;
        speedTimes = speedTimes.filter(time => time >= cutoff);
        speedBadge.hidden = !options.settings().showChatSpeed;
        speedBadge.textContent = `${(speedTimes.length / 10).toFixed(1).replace('.', ',')}/с`;
        speedBadge.title = 'Сообщений в секунду за последние 10 секунд';
      }
    }

    document.addEventListener('contextmenu', event => {
      const emote = event.target.closest?.('.vortex-zw-stack');
      if (emote && emote.closest('.vortex-chat-line')) {
        const codes = [...emote.querySelectorAll('img[alt]')].map(image => image.alt).filter(Boolean);
        if (codes.length && options.insertText(`${codes.join(' ')} `)) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      const username = event.target.closest?.(USER);
      if (!username || !username.closest('.vortex-chat-line')) return;
      const user = (username.getAttribute('data-a-user') || username.getAttribute('data-user') || username.textContent || '').trim();
      if (/^[a-z0-9_]{1,25}$/i.test(user) && options.insertText(`@${user} `)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);

    // Clicking a Twitch username opens Vortex's full profile card.
    // Preserve modifier-click and provide access to Twitch's native user card.
    let passThroughNativeUserClick = false;
    document.addEventListener('click', event => {
      if (passThroughNativeUserClick || event.defaultPrevented || event.button !== 0 ||
          event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const username = event.target.closest?.(USER);
      if (!username || !username.closest(LINE + ', .vortex-paused-view')) return;
      if (card?.overlay.contains(username)) return;
      const user = (username.getAttribute('data-a-user') ||
        username.getAttribute('data-user') ||
        username.querySelector('[data-a-user]')?.getAttribute('data-a-user') ||
        username.textContent || '').trim();
      if (!/^[a-z0-9_]{1,25}$/i.test(user)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openCard(user, options.channel(), username);
    }, true);

    document.addEventListener('click', event => {
      const nativeMention = event.target.closest?.('.mention-fragment, [data-a-target="chat-message-mention"]');
      if (nativeMention?.closest('.chat-line__message, [data-a-target="chat-line-message"], .vortex-paused-view')) {
        const user = nativeMention.textContent.trim().match(/^@([a-z0-9_]{1,25})\b/i)?.[1];
        if (user) {
          event.preventDefault();
          event.stopPropagation();
          openCard(user, options.channel(), nativeMention);
        }
      }
    }, true);

    document.addEventListener('click', event => {
      const pausedMention = event.target.closest?.('.vortex-paused-view .vortex-chat-mention');
      if (pausedMention) {
        const user = pausedMention.textContent.slice(1);
        if (/^[a-z0-9_]{1,25}$/i.test(user)) {
          event.preventDefault();
          event.stopPropagation();
          openCard(user, options.channel(), pausedMention);
        }
        return;
      }
      const quote = event.target.closest?.('.vortex-message-quote');
      if (quote) {
        event.preventDefault();
        event.stopPropagation();
        const name = quote.dataset.vortexUser || '';
        if (!/^[a-z0-9_]{1,25}$/i.test(name)) return;
        const snippet = (quote.dataset.vortexText || '').replace(/\\s+/g, ' ').slice(0, 180);
        const message = '@' + name + (snippet ? ' «' + snippet + '» ' : ' ');
        if (!options.insertText(message)) options.toast('Поле ввода Twitch недоступно');
        return;
      }
      const copy = event.target.closest?.('.vortex-message-copy');
      if (copy) {
        event.preventDefault();
        event.stopPropagation();
        navigator.clipboard.writeText(copy.dataset.vortexCopy || '')
          .then(() => options.toast('Сообщение скопировано'))
          .catch(() => options.toast('Не удалось скопировать. Текст доступен в истории пользователя.'));
        return;
      }
      const target = event.target.closest?.('.vortex-user-history-button');
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      openCard(target.dataset.vortexUser, target.dataset.vortexChannel, target);
    });
    document.addEventListener('mousemove', event => {
      if (!scroller) return;
      const rect = scroller.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) {
        resumedUnderPointer = false;
        if (paused?.reason === 'hover' && !card && !event.target.closest?.('.seventv-card-overlay, .seventv-settings-overlay')) resume();
      }
    });
    document.addEventListener('keydown', event => {
      if (!card) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeCard(); return; }
      // Ctrl+F inside the card searches its local message history, not the page.
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault(); event.stopPropagation();
        card.search.focus(); card.search.select(); return;
      }
      if (event.key !== 'Tab') return;
      const controls = [...card.overlay.querySelectorAll('button:not(:disabled), a[href], input')];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }, true);
    window.addEventListener('resize', positionPause);
    window.addEventListener('scroll', positionPause, true);
    window.addEventListener('pagehide', () => { resume(false); closeCard(); });
    return { attach, capture, mountHeader, maintain, pause, resume,
      openUser: (user, trigger) => {
        if (/^[a-z0-9_]{1,25}$/i.test(user)) openCard(user, options.channel(), trigger);
      } };
  }
  root.VortexChatTools = { create, enhanceDialog };
})(globalThis);
