/// <reference types="new-javascript" />

chrome.tabs.query({ active: true, currentWindow: true }, async tabs => {
  if (!tabs[0] || !tabs[0].id) return errored(Error('no active tab'));
  chrome.tabs.connect(tabs[0].id, { name: 'search-ui' });
});

/**
 * @template T
 * @param {string} elid
 * @param {new() => T} type
 * @returns {T}
 */
function id(elid, type) {
  let el = document.getElementById(elid);
  if (!el) throw new Error(`cannot find element of id ${elid}`);
  if (!(el instanceof type)) throw new Error(`element not ${type.name}`);
  return el;
}

var input = id('query', HTMLTextAreaElement),
  index_el = id('index', HTMLSpanElement),
  total_el = id('total', HTMLSpanElement),
  pos_el = id('position', HTMLSpanElement),
  error_el = id('error', HTMLTextAreaElement),
  active = false, index = 1, total = 0, error = '', size = getComputedStyle(document.documentElement).fontSize, /** @type {[string, ...any] | null} */ queued = null;

/**
 * @param {string} _size
 */
function setSize(_size) {
  size = _size;
  (/** @type {CSSStyleRule} */ (document.styleSheets[0].cssRules[0])).style?.setProperty('font-size', size);
}
setSize(size);

input.addEventListener('input', inputListener);

function inputListener() {
  try {
    resize(input);
    if (active) { queued = ['query', input.value, 'g']; send(['break']); return; } active = true;
    send(['query', input.value, 'g']);
  } catch (e) { errored(e); }
}

/**
 * @param {HTMLTextAreaElement} textarea
 */
function resize(textarea) {
  textarea.style.height = `0px`;
  textarea.style.height = `round(down, ${textarea.scrollHeight}px, ${getComputedStyle(textarea).lineHeight})`;
}

input.addEventListener('keydown', e => {
  try {
    let action = 'none';
    if (key(e, 'Enter', 0, 0, 1) ||
      key(e, 'ArrowUp')) action = 'prev';
    if (key(e, 'Enter') || key(e, 'ArrowDown')) action = 'next';
    if (action === 'none') return;
    e.preventDefault();

    if (active) { send(['break']); return; } active = true;
    if (action === 'prev') index--;
    if (action === 'next') index++;
    if (index < 1) index = total;
    if (index > total) index = 1;
    update();
    send(index === 0 ? ['hide'] : ['index', index - 1]);
  } catch (e) { errored(e); }
});


/**
 * @param {KeyboardEvent} event
 * @param {string} key
 * @param {boolean | 0 | 1} [ctrl]
 * @param {boolean | 0 | 1} [option]
 * @param {boolean | 0 | 1} [shift]
 * @param {boolean | 0 | 1} [command]
 */
function key(event, key, ctrl = false, option = false, shift = false, command = false) {
  return event.key === key && event.ctrlKey == ctrl && event.altKey == option && event.shiftKey == shift && event.metaKey == command;
}

function update() {
  try {
    index = Math.min(Math.max(index, 1), total);
    index_el.textContent = `${index}`;
    total_el.textContent = `${total}`;
    error_el.value = `${error}`; resize(error_el);
    if (!total) pos_el.classList.add('blank');
    else pos_el.classList.remove('blank');
    if (!error) error_el.classList.add('blank');
    else error_el.classList.remove('blank');
  } catch (e) { errored(e); }
}
update();

chrome.runtime.onMessage.addListener((...args) => { receiver(...args); return undefined; });

/**
 * @param {any} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {() => void} _
 */
function receiver(message, sender, _) {
  try {
    active = false;
    switch (message[0]) {
      case 'change': message.shift(); let cont = message[0];
        message.shift(); receiver(message, sender, _); active = true;
        send(cont); break;
      case 'total': total = message[1]; error = ''; update(); break;
      case 'error': total = 0; error = message[1]; update(); break;
      case 'complete': break;
      default: errored(`invalid action '${message[0]}'`);
    }
    if (queued) {
      active = true;
      send(queued);
      queued = null;
    }
    return undefined;
  } catch (e) { errored(e); }
}

/**
 * @param {any} e
 */
function errored(e) {
  error_el.textContent = `UI: ${e}`;
}

/**
 * @param {[string, ...any]} message
 */
function send(message) {
  return chrome.tabs.query({ active: true, currentWindow: true }, async tabs => {
    if (!tabs[0] || !tabs[0].id) return errored(Error('no active tab'));
    chrome.tabs.sendMessage(tabs[0].id, message);
  });
}
