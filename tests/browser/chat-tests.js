document.addEventListener('DOMContentLoaded', async () => {
  const results = document.getElementById('results');
  const wait = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));
  let failures = 0;
  function check(name, condition) {
    const item = document.createElement('li');
    item.className = condition ? 'pass' : 'fail';
    item.textContent = `${condition ? 'PASS' : 'FAIL'} · ${name}`;
    results.appendChild(item);
    if (!condition) failures++;
  }
  const chat = document.querySelector('.chat-scrollable-area__message-container');
  function line(user, text) {
    const node = document.createElement('div');
    node.className = 'chat-line__message';
    const author = document.createElement('span');
    author.className = 'chat-line__username';
    author.textContent = user;
    const fragment = document.createElement('span');
    fragment.className = 'text-fragment';
    fragment.textContent = text;
    node.append(author, fragment);
    return node;
  }
  await wait();
  const wrapper = document.createElement('div');
  const first = line('alice', 'Привет TestEmote Overlay');
  const second = line('alice', 'Привет TestEmote Overlay');
  const third = line('alice', 'Привет TestEmote Overlay');
  const otherUser = line('bob', 'Привет TestEmote Overlay');
  wrapper.append(first, second, third, otherUser);
  chat.appendChild(wrapper);
  await wait();
  check('Nested new lines are enriched; wrapper stays untouched', first.classList.contains('vortex-chat-line') && !wrapper.classList.contains('vortex-chat-line'));
  check('Emote plus Zero-Width overlay renders', first.querySelectorAll('.vortex-chat-emote').length === 1 && first.querySelectorAll('.vortex-zw-overlay').length === 1);
  check('Copy button stays beside the username rather than adding a row',
    first.querySelector('.vortex-user-history-button')?.nextElementSibling === first.querySelector('.vortex-message-copy'));
  const mentionLine = line('viewer', 'Привет @fnip!');
  chat.appendChild(mentionLine);
  await wait();
  const mention = mentionLine.querySelector('.vortex-chat-mention');
  check('Mention is clickable and retains punctuation', mention?.textContent === '@fnip' && mentionLine.querySelector('.text-fragment')?.textContent === 'Привет @fnip!');
  mention?.click();
  check('Mention opens the named user card', document.querySelector('.vortex-user-card h2')?.textContent === 'fnip');
  document.querySelector('.vortex-user-card header button')?.click();
  const wrappedMention = line('viewer', 'Смотри (@fnip), привет!');
  chat.appendChild(wrappedMention);
  await wait();
  check('Mention remains clickable inside surrounding punctuation',
    wrappedMention.querySelector('.vortex-chat-mention')?.textContent === '@fnip' &&
    wrappedMention.textContent.includes('(@fnip),'));
  const twitchStyle = document.createElement('div');
  twitchStyle.className = 'chat-line__message';
  twitchStyle.innerHTML = '<span class="chat-line__username"><span data-a-target="chat-message-username" data-a-user="viewer">viewer</span></span><span data-a-target="chat-line-message-body"><span class="mention-fragment" data-a-target="chat-message-mention">@fnip</span><span class="text-fragment"> hello</span></span><div class="chat-line__icons"></div>';
  chat.appendChild(twitchStyle);
  await wait();
  check('Copy control uses Twitch icon area without extending the message flow',
    twitchStyle.querySelector('.chat-line__icons > .vortex-message-copy') !== null);
  twitchStyle.querySelector('.mention-fragment').click();
  check('Native Twitch mention opens the named user card', document.querySelector('.vortex-user-card h2')?.textContent === 'fnip');
  document.querySelector('.vortex-user-card header button')?.click();
  const wrapped = document.createElement('div');
  wrapped.className = 'chat-line__message';
  wrapped.innerHTML = '<span class="chat-line__username">viewer</span><span class="text-fragment"><span class="nested-text">TestEmote</span></span>';
  chat.appendChild(wrapped);
  await wait();
  check('7TV emote renders inside nested Twitch text markup', wrapped.querySelector('.vortex-chat-emote')?.alt === 'TestEmote');
  const plain = document.createElement('div');
  plain.className = 'chat-line__message';
  plain.innerHTML = '<span class="chat-line__username">viewer</span><span class="message-body">TestEmote</span>';
  chat.appendChild(plain);
  await wait();
  check('7TV emote renders when Twitch text selectors are absent', plain.querySelector('.vortex-chat-emote')?.alt === 'TestEmote');
  check('Only consecutive messages by the same author are grouped', second.classList.contains('vortex-duplicate-line') && third.classList.contains('vortex-duplicate-line') && !otherUser.classList.contains('vortex-duplicate-line') && first.querySelector('.vortex-repeat-badge')?.textContent === '×3');
  check('Message timestamps and Cyrillic highlights render', first.querySelectorAll('time').length === 1 && first.classList.contains('vortex-highlight-line'));
  check('Font size is applied to actual messages', getComputedStyle(first).fontSize === '16px');
  check('Chat theme uses compact flat rows without hiding the text',
    getComputedStyle(first).borderRadius === '0px' && getComputedStyle(first).color === 'rgb(239, 239, 241)');
  first.remove();
  await wait();
  check('Removing a group head reveals the next surviving message', !second.classList.contains('vortex-duplicate-line') && second.querySelector('.vortex-repeat-badge')?.textContent === '×2');
  wrapper.prepend(first);
  await wait();
  let mutations = 0;
  const observer = new MutationObserver(items => { mutations += items.length; });
  observer.observe(chat, { childList: true, subtree: true, characterData: true });
  await wait(300);
  observer.disconnect();
  check('Enrichment settles without a mutation loop', mutations === 0);
  await fixtureSettings({ enable7TV: false, alternatingRows: false, collapseSpam: false, showTimestamps: false, highlightWords: '', fontSize: 18 });
  await wait();
  check('Disabling 7TV restores original emote codes', !first.querySelector('img') && first.querySelector('.text-fragment').textContent === 'Привет TestEmote Overlay');
  check('Reading settings remove previous decoration', !first.querySelector('time') && !chat.querySelector('.vortex-alt-row-even, .vortex-highlight-line, .vortex-duplicate-line, .vortex-repeat-badge') && getComputedStyle(first).fontSize === '18px');
  await fixtureSettings({ enable7TV: true });
  await wait();
  check('Re-enabling a provider re-renders existing messages', first.querySelectorAll('.vortex-chat-emote').length === 1);
  first.querySelector('.text-fragment').textContent = 'Edited TestEmote';
  await wait();
  check('React-style replacement is detected', first.querySelector('.vortex-chat-emote')?.alt === 'TestEmote' && first.querySelector('.text-fragment').textContent === 'Edited ');
  first.querySelector('.text-fragment').textContent = 'one';
  await wait();
  first.querySelector('.text-fragment').firstChild.data = 'TestEmote';
  await wait();
  check('Text node changes are detected', Boolean(first.querySelector('.vortex-chat-emote')));
  const native = line('charlie', 'native ');
  const nativeImg = document.createElement('img');
  nativeImg.alt = 'NativeTwitch';
  native.appendChild(nativeImg);
  chat.appendChild(native);
  await wait();
  check('Native Twitch emote nodes are preserved', nativeImg.isConnected && nativeImg.parentNode === native);
  await chrome.tabs.sendMessage(1, { action: 'OPEN_VORTEXCHAT_MODAL' });
  document.querySelector('[data-tab="chat"]').click();
  check('In-page reading settings open with persisted values', document.querySelector('#vortex-font-size')?.value === '18');
  document.querySelector('#seventv-settings-close').click();
  const input = document.querySelector('textarea');
  input.focus();
  input.value = 'TestEmote';
  input.setSelectionRange(input.value.length, input.value.length);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(250);
  check('A complete existing emote code stays visible in suggestions',
    document.querySelector('#vortex-autocomplete-popup .vortex-ac-item')?.dataset.code === 'TestEmote');
  input.value = 'hello   :Test';
  input.setSelectionRange(input.value.length, input.value.length);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await wait();
  check('Typing an available emote shows its code as a suggestion',
    document.querySelector('#vortex-autocomplete-popup .vortex-ac-item')?.dataset.code === 'TestEmote');
  const tabKey = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  input.dispatchEvent(tabKey);
  check('Tab completion preserves existing whitespace', input.value === 'hello   TestEmote ' && tabKey.defaultPrevented);
  input.value = 'hello Test';
  input.setSelectionRange(2, 2);
  const middleTab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  input.dispatchEvent(middleTab);
  check('Completion does not rewrite a draft when caret is in the middle', input.value === 'hello Test' && !middleTab.defaultPrevented);
  input.setSelectionRange(input.value.length, input.value.length);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  input.dispatchEvent(enter);
  check('Enter is left to Twitch even with suggestions open', !enter.defaultPrevented);
  let sends = 0;
  document.querySelector('[data-a-target="chat-send-button"]').onclick = () => { sends++; };
  for (let index = 0; index < 3; index++) {
    await chrome.tabs.sendMessage(1, { action: 'SEND_EMOTE_TO_TWITCH_CHAT', text: 'TestEmote' });
  }
  await wait();
  check('Repeated send requests trigger one Twitch message', sends === 1);
  input.blur();
  await fixtureSettings({ messageGap: 4, emoteGap: 5, showCopyButton: false });
  await wait();
  check('Message and emote spacing are configurable', getComputedStyle(first).paddingTop === '4px' && getComputedStyle(first.querySelector('.vortex-zw-stack')).marginRight === '5px');
  check('Copy control can be hidden', first.querySelector('.vortex-message-copy').hidden);
  await fixtureSettings({ showCopyButton: true });
  await wait();
  check('Copy control can be restored', !first.querySelector('.vortex-message-copy').hidden);
  input.value = '';
  const userMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  first.querySelector('.chat-line__username').dispatchEvent(userMenu);
  await wait();
  check('Right-click on a username inserts a mention', userMenu.defaultPrevented && input.value.includes('@alice'));
  input.value = '';
  const emoteMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  first.querySelector('.vortex-zw-stack').dispatchEvent(emoteMenu);
  await wait();
  check('Right-click on a chat emote inserts its code', emoteMenu.defaultPrevented && input.value.includes('TestEmote'));
  chat.style.cssText = 'height:200px;overflow-y:auto;width:410px';
  document.querySelector('[data-vortex-pause]').click();
  const frozen = document.querySelector('.vortex-paused-view');
  const frozenText = frozen?.querySelector('.vortex-paused-scroll')?.textContent;
  check('Manual pause creates a separate reading viewport', Boolean(frozen) && !frozen.querySelector('.chat-line__message'));
  check('Paused native content cannot receive accidental input', chat.inert && chat.getAttribute('aria-hidden') === 'true');
  const arriving = line('alice', 'Arrived while paused');
  chat.appendChild(arriving);
  await wait();
  check('New messages do not change the frozen view and are counted once', frozen.querySelector('.vortex-paused-scroll').textContent === frozenText && frozen.querySelector('.vortex-pause-toolbar').textContent.includes('новых: 1'));
  await wait(950);
  check('Header shows recent chat speed', /^\d+,\d\/с$/.test(document.querySelector('.vortex-chat-speed')?.textContent || '') && document.querySelector('.vortex-chat-speed').textContent !== '0,0/с');
  otherUser.remove();
  await wait();
  check('Twitch trimming cannot remove frozen messages', frozen.querySelector('.vortex-paused-scroll').textContent === frozenText);
  frozen.querySelector('.vortex-tool-button').click();
  check('Resume removes the snapshot and returns to live chat', !document.querySelector('.vortex-paused-view') && !chat.inert && !chat.hasAttribute('aria-hidden') && document.querySelector('[data-vortex-pause]').getAttribute('aria-pressed') === 'false');
  await fixtureSettings({ pauseOnHover: true });
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: -10, clientY: -10, bubbles: true }));
  chat.dispatchEvent(new MouseEvent('mouseenter'));
  check('Hover pause can be enabled', Boolean(document.querySelector('.vortex-paused-view')));
  await fixtureSettings({ pauseOnHover: false });
  check('Disabling hover pause immediately resumes reading', !document.querySelector('.vortex-paused-view'));
  const historyButton = arriving.querySelector('.vortex-user-history-button');
  historyButton.click();
  check('User history opens with previously observed messages', document.querySelector('.vortex-user-card h2')?.textContent === 'alice' && document.querySelector('.vortex-history-list').textContent.includes('Arrived while paused'));
  check('History preserves original codes and whitespace for layered emotes', document.querySelector('.vortex-history-list').textContent.includes('Привет TestEmote Overlay'));
  const historySearch = document.querySelector('.vortex-user-card input');
  historySearch.value = 'Arrived';
  historySearch.dispatchEvent(new Event('input', { bubbles: true }));
  check('History search filters messages for the selected author', document.querySelectorAll('.vortex-history-message').length === 1 && !document.querySelector('.vortex-history-list').textContent.includes('bob'));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  check('Escape closes history and restores keyboard focus', !document.querySelector('.vortex-user-card') && document.activeElement === historyButton);
  first.querySelector('.vortex-zw-stack').click();
  document.querySelector('#vortex-card-favorite').click();
  await wait();
  const saved = await chrome.storage.local.get('vortexFavorites');
  check('Favorites persist and the emote card reflects the saved state', saved.vortexFavorites.includes('7TV:base:TestEmote') && document.querySelector('#vortex-card-favorite').getAttribute('aria-pressed') === 'true');
  document.querySelector('#vortex-card-favorite').click();
  await wait();
  check('Favorites can be removed without changing chat text', (await chrome.storage.local.get('vortexFavorites')).vortexFavorites.length === 0 && Boolean(first.querySelector('.vortex-chat-emote')));
  document.querySelector('#seventv-card-close').click();
  check('Message copy buttons keep the original layered-emote text', second.querySelector('.vortex-message-copy').dataset.vortexCopy === 'Привет TestEmote Overlay');
  first.querySelector('.vortex-zw-stack').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  check('Emote cards are accessible by keyboard', document.querySelector('#seventv-emote-card-modal')?.getAttribute('role') === 'dialog');
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  check('Escape closes emote cards', !document.querySelector('#seventv-emote-card-modal'));
  const picker = document.createElement('div');
  picker.setAttribute('data-a-target', 'emote-picker');
  const pickerSearch = document.createElement('input');
  pickerSearch.type = 'search';
  pickerSearch.setAttribute('data-a-target', 'emote-name-filter');
  const pickerScroll = document.createElement('div');
  pickerScroll.className = 'emote-picker__scrollable-content';
  picker.append(pickerSearch, pickerScroll);
  document.body.appendChild(picker);
  await wait(1000);
  check('Native picker has a favorites section even when it is empty', Boolean(picker.querySelector('#vortex-sec-favorites .vortex-favorites-empty')));
  check('Native picker has a recent emotes section', Boolean(picker.querySelector('#vortex-sec-recent')));
  const quickButton = document.querySelector('.vortex-quick-button');
  quickButton?.click();
  const quickPanel = document.querySelector('#vortex-quick-panel');
  check('Quick settings opens from chat header', Boolean(quickPanel));
  const palette = quickPanel?.querySelector('[data-quick-key="themePreset"]');
  if (palette) { palette.value = 'orchid'; palette.dispatchEvent(new Event('change', { bubbles: true })); }
  await wait();
  check('Quick settings applies palette and persists it', document.documentElement.dataset.vortexPreset === 'orchid' &&
    (await chrome.storage.local.get('vortexSettings')).vortexSettings.themePreset === 'orchid');
  const density = quickPanel?.querySelector('[data-quick-key="chatDensity"]');
  if (density) { density.value = 'compact'; density.dispatchEvent(new Event('change', { bubbles: true })); }
  await wait();
  check('Quick settings applies compact chat density', document.documentElement.dataset.vortexDensity === 'compact');
  quickPanel?.querySelector('[data-quick-close]')?.click();
  check('Quick settings closes and restores button state', !document.querySelector('#vortex-quick-panel') && quickButton?.getAttribute('aria-expanded') === 'false');
  picker.querySelector('[data-emote-code="TestEmote"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  await wait();
  check('Right-click adds an available emote to the favorites section', picker.querySelectorAll('#vortex-sec-favorites [data-emote-code="TestEmote"]').length === 1);
  pickerSearch.value = 'no-such-code';
  pickerSearch.dispatchEvent(new Event('input', { bubbles: true }));
  check('Picker search also filters favorites', !picker.querySelector('#vortex-sec-favorites .vortex-native-emote-btn'));
  pickerSearch.value = '';
  pickerSearch.dispatchEvent(new Event('input', { bubbles: true }));
  await fixtureSettings({ enable7TV: false });
  await wait();
  check('Disabling a provider hides its favorites without deleting them', !picker.querySelector('#vortex-sec-favorites .vortex-native-emote-btn') && (await chrome.storage.local.get('vortexFavorites')).vortexFavorites.length === 1);
  await fixtureSettings({ enable7TV: true });
  picker.remove();
  const firstMessage = document.createElement('div');
  firstMessage.className = 'chat-line__message';
  firstMessage.dataset.firstMsg = 'true';
  firstMessage.innerHTML = '<span class="chat-line__username">newcomer</span><span data-a-target="chat-line-message-body">Hello</span>';
  chat.appendChild(firstMessage);
  await wait();
  check('First message has FM badge', firstMessage.querySelector('.vortex-first-message-badge')?.textContent === 'FM');

  const twitchFirst = document.createElement('div');
  twitchFirst.className = 'chat-line__message';
  twitchFirst.innerHTML = '<span class="chat-line__username">newcomer2</span><span class="text-fragment">Hello</span>';
  twitchFirst.__reactFiber$fixture = { memoizedProps: {}, return: { memoizedProps: {
    message: { id: 'first-react', messageBody: 'Hello', isFirstMsg: true, deleted: false }
  } } };
  chat.appendChild(twitchFirst);
  await wait();
  check('FM reads Twitch message metadata even without a visible marker',
    twitchFirst.dataset.vortexFirstMsg === 'true' && twitchFirst.querySelector('.vortex-first-message-badge')?.textContent === 'FM');

  const twitchDeleted = document.createElement('div');
  twitchDeleted.className = 'chat-line__message';
  twitchDeleted.innerHTML = '<span class="chat-line__username">viewer</span><span data-a-target="chat-deleted-message-placeholder">сообщение удалено модератором.</span>';
  twitchDeleted.__reactFiber$fixture = { memoizedProps: {}, return: { memoizedProps: {
    message: { id: 'deleted-react', messageBody: 'Original 7TV text', isFirstMsg: false, deleted: true }
  } } };
  chat.appendChild(twitchDeleted);
  await wait();
  check('Deleted Twitch placeholder shows the original message dimmed',
    twitchDeleted.classList.contains('vortex-moderated-line') &&
    twitchDeleted.querySelector('.vortex-restored-message')?.textContent === 'Original 7TV text' &&
    !twitchDeleted.querySelector('[data-a-target="chat-deleted-message-placeholder"]'));

  const moderated = document.createElement('div');
  moderated.className = 'chat-line__message';
  moderated.dataset.id = 'moderated-1';
  moderated.innerHTML = '<span class="chat-line__username">viewer</span><span data-a-target="chat-line-message-body">Original text</span>';
  chat.appendChild(moderated);
  await wait();
  moderated.querySelector('[data-a-target="chat-line-message-body"]').textContent = 'сообщение удалено модератором';
  await wait();
  check('Moderated message keeps original text and dims the line',
    moderated.classList.contains('vortex-moderated-line') && moderated.textContent.includes('Original text') &&
    !moderated.textContent.includes('сообщение удалено'));
  const cosmeticLine = line('viewer', 'Cosmetics test');
  chat.appendChild(cosmeticLine);
  await wait();
  check('7TV paint and badge render for the linked Twitch user',
    cosmeticLine.querySelector('.chat-line__username')?.classList.contains('vortex-7tv-paint') &&
    cosmeticLine.querySelector('.vortex-7tv-badge')?.src.includes('cdn.7tv.app/badge/fixture/2x.webp'));
  await fixtureSettings({ enable7TVCosmetics: false });
  await wait();
  check('Turning cosmetics off removes paint and badge',
    !cosmeticLine.querySelector('.vortex-7tv-badge') &&
    !cosmeticLine.querySelector('.chat-line__username')?.classList.contains('vortex-7tv-paint'));
  await fixtureSettings({ highlightWords: '', highlightUsers: 'viewer' });
  await wait();
  check('Highlighting a user marks their messages without matching message text', cosmeticLine.classList.contains('vortex-highlight-line'));
  await fixtureSettings({ mentionName: 'fnip', mentionColor: '#ff8800' });
  const namedMention = line('somebody', 'Hello @fnip!');
  chat.appendChild(namedMention);
  await wait(180);
  check('Named mentions are highlighted with the selected color',
    namedMention.classList.contains('vortex-named-mention') && namedMention.style.getPropertyValue('--vortex-mention-color') === '#ff8800');
  await fixtureSettings({ mentionIgnoreUsers: 'somebody' });
  await wait();
  check('Mention exclusions suppress named users', !namedMention.classList.contains('vortex-named-mention'));
  await fixtureSettings({ mentionIgnoreUsers: '', mentionMuteChannels: 'forsen' });
  await wait();
  check('Mention exclusions suppress named channels', !namedMention.classList.contains('vortex-named-mention'));
  await fixtureSettings({ mentionMuteChannels: '' });
  await wait();
  check('Removing exclusions restores mention highlighting', namedMention.classList.contains('vortex-named-mention'));
  check('Channel quick links point to the current channel',
    document.querySelector('#vortex-channel-links a[href="/forsen/clips"]') !== null);
  await fixtureSettings({ mentionName: '', channelQuickLinks: false });
  await wait();
  check('Turning off mention and channel controls removes decorations',
    !namedMention.classList.contains('vortex-named-mention') && !document.querySelector('#vortex-channel-links'));
  await fixtureSettings({ liveControls: true, autoCatchup: true, sidebarPreview: true });
  const video = document.createElement('video');
  video.getBoundingClientRect = () => ({ width: 640, height: 360, right: 640, bottom: 360 });
  let liveEdge = 20;
  Object.defineProperty(video, 'seekable', { value: { length: 1, end: () => liveEdge } });
  video.currentTime = 10;
  document.body.append(video);
  const sideLink = document.createElement('a');
  sideLink.className = 'side-nav-card__link';
  sideLink.href = '/streamer';
  document.body.append(sideLink);
  sideLink.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
  await wait(1450);
  check('Back-to-live button appears only when the video is behind',
    document.querySelector('#vortex-back-to-live')?.textContent === '● В эфир');
  check('Opt-in catchup gently speeds up delayed live video', video.playbackRate === 1.05);
  document.querySelector('#vortex-back-to-live')?.click();
  check('Back-to-live button seeks near the live edge', video.currentTime >= 19);
  check('Sidebar hover shows a channel-specific preview',
    document.querySelector('#vortex-sidebar-preview img')?.src.includes('live_user_streamer-320x180.jpg'));
  sideLink.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }));
  await fixtureSettings({ autoCatchup: false });
  await wait(1300);
  check('Turning off catchup restores normal playback speed', video.playbackRate === 1);
  liveEdge = 1073741824;
  await wait(1300);
  check('Twitch sentinel time never appears as a billion-second live delay', !document.querySelector('#vortex-back-to-live'));
  video.remove();
  sideLink.remove();
  document.getElementById('summary').textContent = `${results.children.length - failures}/${results.children.length} passed${failures ? `; ${failures} failed` : ''}`;
});
