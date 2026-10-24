document.addEventListener('DOMContentLoaded', () => {
  const chat = document.querySelector('.chat-scrollable-area__message-container');
  let count = 0;
  function add(user, text) {
    const line = document.createElement('div');
    line.className = 'chat-line__message';
    line.setAttribute('data-id', `preview-${++count}`);
    const username = document.createElement('span');
    username.className = 'chat-line__username';
    username.setAttribute('data-a-user', user);
    username.textContent = user;
    const content = document.createElement('span');
    content.className = 'text-fragment';
    content.textContent = text;
    line.append(username, document.createTextNode(' '), content);
    chat.appendChild(line);
    if (!document.querySelector('.vortex-paused-view')) chat.scrollTop = chat.scrollHeight;
  }
  fixtureSettings({ showTimestamps: true, fontSize: 14, highlightWords: 'VortexChat', alternatingRows: true, collapseSpam: false });
  const samples = [
    ['ViewerOne', 'Привет! Сегодня тестируем обновлённый чат.'],
    ['ViewerTwo', 'Можно читать сообщения без спешки.'],
    ['ViewerOne', 'Нажмите паузу в заголовке — лента останется на месте.'],
    ['ViewerThree', 'А новые сообщения будут посчитаны отдельно.'],
    ['ViewerTwo', 'Удобно, когда чат движется слишком быстро.'],
    ['ViewerOne', 'В истории есть поиск и копирование текста.'],
    ['ViewerThree', 'Избранные смайлы сохраняются между вкладками.'],
    ['ViewerOne', 'VortexChat: сообщения и настройки под рукой.']
  ];
  samples.forEach(([user, text]) => add(user, text));
  document.getElementById('demo-add').onclick = () => add('ViewerTwo', `Новое сообщение во время чтения · ${count + 1}`);
  document.querySelector('[data-a-target="chat-send-button"]').onclick = () => {
    const input = document.querySelector('textarea');
    if (input.value.trim()) { add('You', input.value.trim()); input.value = ''; }
    document.getElementById('demo-status').textContent = 'Сообщение добавлено только на этом стенде.';
  };
});
