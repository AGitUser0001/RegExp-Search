/// <reference types="new-javascript" />

const sheet = new CSSStyleSheet();
/** @type {{ startNode: Text, endNode: Text, start: number, end: number, range?: Range, highlight?: Highlight }[]} */
var results = [], index = 0, bit = 32, hpriority = 1, priority = 2, breaking = false;

chrome.runtime.onMessage.addListener((...args) => { receiver(...args); return undefined; });

/**
 * @param {any} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {() => void} _
 */
async function receiver(message, sender, _) {
  try {
    switch (message[0]) {
      case 'query':
        unhighlightIndex(); unhighlight();
        if (await subroutine(search, message.slice(1))) break;
        if (await subroutine(highlight)) break;
        scrollToIndex(); highlightIndex();
        send(['total', results.length]); break;
      case 'index':
        if (check(message[1], message)) break; setIndex(message[1]);
        send(['complete']); break;
      case 'hide':
        unhighlightIndex() ;
        send(['complete']); break;
      case 'break':
        breaking = true; return;
      default: errored(Error(`invalid action '${message[0]}'`));
    }
    breaking = false;
  } catch (e) { throw errored(e); }
}

/**
 * @template {Array} A
 * @template {(...args: A) => Generator} T
 * @param {T} func
 * @param {Parameters<T>} args
 * @returns {Promise<ReturnType<T> extends Generator<unknown, infer TResult, unknown> ? TResult : never>}
 */
async function subroutine(func, ...args) {
  const fps = 1000 / 60;
  let gen = func(...args), last = performance.now(), count = 0, measure = 1000, result;
  while (count++, result = gen.next()) {
    if (count > measure && performance.now() > (last + fps)) {
      await new Promise(resolve => {
        setTimeout(resolve);
      });
      count = 0, last = performance.now();
    }
    if (result.done) {
      return result.value;
    }
  }
  throw 'impossible';
}

/**
 * @param {[string, string]} data
 */
function* search(data) {
  try {
    results = []; let /** @type {RegExp} */ re;
    if (data[0].length < 1) return false;
    try {
      re = new RegExp(data[0], data[1]);
    } catch (e) {
      if (e instanceof SyntaxError) {
        send(['error', `${e.message}`]);
        return true;
      } else {
        throw errored(e);
      }
    }

    let strings = ""
    let indexed = []

    let nodes = document.createNodeIterator(document, NodeFilter.SHOW_TEXT), /** @type {Text | null} */ node;
    while (node = /** @type {Text | null} */ (nodes.nextNode())) {
      if (breaking) break;
      yield;
      if (!(node instanceof Text)) continue;
      if (!node.nodeValue) continue;
      if (node.parentElement && !node.parentElement.checkVisibility({ contentVisibilityAuto: true })) continue;

      let info = { start: strings.length, end: 0, node }
      strings += node.nodeValue;
      info.end = strings.length

      indexed.push(info)
    }
    if (checkBreak()) return true;
    let /** @type {RegExpExecArray | null}*/ match;
    let iPos = 0;
    while (match = re.exec(strings)) {
      if (breaking) break;
      yield;
      if (match === null) break;
      if (match[0] === '') { re.lastIndex++; continue; }
      let snode, enode, s = 0, e = 0;
      let epos = match.index + match[0].length;
      while (iPos < indexed.length) {
        if (indexed[iPos].start <= match.index && match.index < indexed[iPos].end) {
          snode = indexed[iPos].node
          s = match.index - indexed[iPos].start
        }
        if (indexed[iPos].start < epos && epos <= indexed[iPos].end) {
          enode = indexed[iPos].node
          e = epos - indexed[iPos].start
          break;
        }
        iPos++;
      }
      if (!snode || !enode)
        break;
      results.push({ startNode: snode, endNode: enode, start: s, end: e });
    }
    if (checkBreak()) return true;
    index = Math.min(Math.max(index, 0), results.length - 1);
  } catch (e) { throw errored(e); }
}

function checkBreak() {
  if (breaking) {
    send(['complete']);
    return true;
  }
}

function* highlight() {
  try {
    if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets.push(sheet);

    for (let index = 0; index < results.length; index++) {
      yield;
      if (check(index)) breaking = true;
      if (breaking) break;
      const data = results[index];
      let range = new Range();
      range.setStart(data.startNode, data.start);
      range.setEnd(data.endNode, data.end);
      data.range = range;

      let hl = new Highlight(range);
      hl.priority = (2 ** (bit - 1)) - priority;
      data.highlight = hl;

      CSS.highlights.set(`chrome-extension-${chrome.runtime.id}-highlight${index}`, hl);
      sheet.insertRule(`
        ::highlight(chrome-extension-${chrome.runtime.id}-highlight${index}) {
          background-color: mark;
          color: marktext;
        }
      `, sheet.cssRules.length);
    }

    if (checkBreak()) {
      unhighlight();
      return true;
    }
  } catch (e) { throw errored(e); }
}

function unhighlight() {
  try {
    sheet.replaceSync('');
    results.forEach((data, index) => {
      if (data.highlight)
        CSS.highlights.delete(`chrome-extension-${chrome.runtime.id}-highlight${index}`);
    });
  } catch (e) { throw errored(e); }
}

function highlightIndex() {
  try {
    if (sheet.cssRules.length <= index || results.length <= index || index < 0) return;
    if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets.push(sheet);

    let rule = sheet.cssRules[index], hl = results[index].highlight;
    if (!(rule instanceof CSSStyleRule)) return;
    rule.style.setProperty('background-color', 'orange');
    if (!hl) return;
    hl.priority = (2 ** (bit - 1)) - hpriority;
  } catch (e) { throw errored(e); }
}

function unhighlightIndex() {
  try {
    if (sheet.cssRules.length <= index || results.length <= index || index < 0) return;
    if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets.push(sheet);

    let rule = sheet.cssRules[index], hl = results[index].highlight;
    if (!(rule instanceof CSSStyleRule)) return;
    rule.style.setProperty('background-color', 'mark');
    if (!hl) return;
    hl.priority = (2 ** (bit - 1)) - priority;
  } catch (e) { throw errored(e); }
}

function scrollToIndex() {
  try {
    if (sheet.cssRules.length <= index || results.length <= index || index < 0) return;
    if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets.push(sheet);

    // // @ts-expect-error
    // results[index].startNode.parentElement?.scrollIntoViewIfNeeded();

    let rect = results[index].range?.getBoundingClientRect(); if (!rect) return;
    if (rect.top < 0 || rect.bottom > document.documentElement.clientHeight) {
      window.scrollBy({ top: rect.y - (document.documentElement.clientHeight / 2), behavior: "smooth" });
    }
    if (rect.left < 0 || rect.right > document.documentElement.clientWidth) {
      window.scrollBy({ left: rect.x - (document.documentElement.clientWidth / 2), behavior: "smooth" });
    }
  } catch (e) { throw errored(e); }
}

/**
 * @param {DOMRect} rect
 * @param {Node | null} base
 */
function getRelativeClientRect(rect, base) {
  try {
    let viewport = base;
    while (viewport) {
      if (viewport instanceof Element) {
        let style = getComputedStyle(viewport);
        if (viewport.scrollHeight > viewport.clientHeight &&
          /^(scroll|overlay|auto)$/.test(style['overflowX'])) {
          break;
        }
        if (viewport.scrollWidth > viewport.clientWidth &&
          /^(scroll|overlay|auto)$/.test(style['overflowY'])) {
          break;
        }
      }
      viewport = viewport.parentElement;
    }
    if (!viewport || viewport === document.documentElement) return rect;

    var vrect = viewport.getBoundingClientRect();
    return [viewport, new DOMRect(rect.x - vrect.x, rect.y - vrect.y, rect.width, rect.height)];
  } catch (e) { throw errored(e); }
}

/**
 * @param {number} idx
 */
function setIndex(idx) { unhighlightIndex(); index = idx; highlightIndex(); scrollToIndex(); }

/**
 * @param {number} index
 * @param {any} [response]
 */
function check(index, response) {
  if (!results[index] || !document.contains(results[index].startNode) || !document.contains(results[index].endNode)) {
    results.splice(index, 1);
    if (response) send(['change', response, 'total', results.length]);
    return true;
  }
}

/**
 * @param {any} e
 */
function errored(e) {
  try {
    send(['error', `${e instanceof Error ? '' : 'Unknown error: '}${e}`]);
  } finally { return e; }
}

/**
 * @param {[string, ...any]} message
 */
function send(message) {
  breaking = false;
  chrome.runtime.sendMessage(message);
}

chrome.runtime.onConnect.addListener(function (port) {
  if (port.name === "search-ui") {
    port.onDisconnect.addListener(function () {
      unhighlightIndex(); unhighlight(); results = [];
    });
  }
});
