const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const acorn = require('acorn');
const root = path.resolve(__dirname, '..');

function target(extra = {}) {
  const listeners = {};
  return Object.assign({
    listeners,
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
    removeEventListener(type, listener) { listeners[type] = (listeners[type] || []).filter(item => item !== listener); },
    dispatch(type, event) { for (const listener of [...(listeners[type] || [])]) listener(event); }
  }, extra);
}

function load(files, window, extras = {}) {
  const context = vm.createContext({ window, ...extras });
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

function createFixture({ opaque = false, allowOpaque = false, acknowledge = true } = {}) {
  const childOrigin = 'https://user.github.io';
  const hostOrigin = opaque ? 'null' : 'https://tv.example';
  const queue = [];
  const successMessages = [];
  const timers = new Map();
  let timerId = 0;
  const setTimeout = fn => { timers.set(++timerId, fn); return timerId; };
  const clearTimeout = id => timers.delete(id);
  const parent = target({ setTimeout, clearTimeout });
  const child = target({ location: { search: allowOpaque ? '?allowOpaqueParent=1' : '' }, setTimeout, clearTimeout });
  parent.parent = parent;
  child.parent = parent;
  parent.postMessage = (data, destination) => {
    assert.equal(destination, opaque ? '*' : hostOrigin);
    if (data.type === 'success') successMessages.push({ data: structuredClone(data), destination });
    queue.push(() => parent.dispatch('message', { data: structuredClone(data), source: child, origin: childOrigin }));
  };
  child.postMessage = (data, destination) => {
    assert.equal(destination, childOrigin);
    queue.push(() => child.dispatch('message', { data: structuredClone(data), source: parent, origin: hostOrigin }));
  };
  const document = target();
  const buttons = Array.from({ length: 13 }, (_, index) => target({
    disabled: index === 12,
    getAttribute(name) {
      if (name === 'data-digit') return index < 9 ? String(index + 1) : index === 10 ? '0' : null;
      return index === 9 ? 'clear' : index === 11 ? 'delete' : null;
    },
    focus() { document.activeElement = this; this.dispatch('focus', {}); }
  }));
  const elements = { code: { value: '' }, status: { textContent: '' }, submit: buttons[12] };
  document.querySelectorAll = () => buttons;
  document.getElementById = id => elements[id];
  load(['core.js', 'bridge.js', 'app.js'], child, { document, navigator: { userAgent: 'test' } });
  load(['core.js', 'bridge.js', 'host.js'], parent);
  const codes = [];
  let canceled = 0;
  const frame = target({ contentWindow: child });
  const host = parent.TVCodeHost.createHost({
    frame, origin: childOrigin, sessionId: 'session-1',
    onCode(code) { codes.push(code); },
    onCancel() { canceled += 1; }
  });
  function flush() { while (queue.length) queue.shift()(); }
  function key(keyCode, repeat = false) {
    let prevented = false;
    parent.dispatch('keydown', { keyCode, repeat, preventDefault() { prevented = true; }, stopImmediatePropagation() {} });
    parent.dispatch('keyup', { keyCode });
    flush();
    return prevented;
  }
  if (!acknowledge) {
    const original = child.postMessage;
    child.postMessage = (data, destination) => { if (data.type !== 'ack') original(data, destination); };
  }
  frame.dispatch('load', {});
  flush();
  return { child, parent, host, frame, codes, successMessages, elements, buttons, document, flush, key, timers, canceled: () => canceled };
}

test('all shipped scripts parse as ES5', () => {
  for (const file of ['core.js', 'bridge.js', 'app.js', 'host.js']) {
    acorn.parse(fs.readFileSync(path.join(root, file), 'utf8'), { ecmaVersion: 5 });
  }
});

test('focus navigation follows the grid, stops at edges and skips disabled submit', () => {
  const f = createFixture();
  const move = f.child.TVCodeCore.moveFocus;
  assert.equal(move(0, 'left', false), 0);
  assert.equal(move(2, 'right', false), 2);
  assert.equal(move(0, 'up', false), 0);
  assert.equal(move(8, 'down', false), 11);
  assert.equal(move(10, 'down', false), 10);
  assert.equal(move(10, 'down', true), 12);
  assert.equal(move(12, 'up', true), 10);
  f.key(40);
  assert.equal(f.document.activeElement, f.buttons[3]);
  f.key(39);
  assert.equal(f.document.activeElement, f.buttons[4]);
});

test('four digits enable submit, preserve zeros and ignore overflow; ack locks form', () => {
  const f = createFixture();
  assert.equal(f.elements.submit.disabled, true);
  for (const digit of [48, 49, 50, 51, 52]) f.key(digit);
  assert.equal(f.elements.code.value, '0123');
  assert.equal(f.elements.submit.disabled, false);
  f.buttons[12].dispatch('click', {});
  f.flush();
  assert.deepEqual(f.codes, ['0123']);
  assert.deepEqual(f.successMessages, [{ data: { type: 'success', pin: '0123' }, destination: 'https://tv.example' }]);
  f.child.dispatch('message', { source: f.parent, origin: 'https://tv.example', data: { channel: 'tv-code', version: 1, type: 'ack', sessionId: 'session-1' } });
  assert.equal(f.successMessages.length, 1);
  assert.equal(f.elements.status.textContent, 'Код получен приложением');
  assert.equal(f.elements.submit.disabled, true);
  f.key(57);
  assert.equal(f.elements.code.value, '0123');
});

test('delete and clear disable submit, and holding Enter does not duplicate input', () => {
  const f = createFixture();
  f.key(13);
  f.key(13, true);
  assert.equal(f.elements.code.value, '1');
  for (const key of [50, 51, 52]) f.key(key);
  assert.equal(f.elements.submit.disabled, false);
  f.buttons[11].dispatch('click', {});
  assert.equal(f.elements.code.value, '123');
  assert.equal(f.elements.submit.disabled, true);
  f.buttons[9].dispatch('click', {});
  assert.equal(f.elements.code.value, '');
});

test('rapid separate presses preserve 0000 and native key holds are ignored', () => {
  const f = createFixture();
  for (let i = 0; i < 4; i += 1) f.key(48);
  assert.equal(f.elements.code.value, '0000');
  f.buttons[9].dispatch('click', {});
  const event = { keyCode: 48, preventDefault() {}, stopPropagation() {} };
  f.document.dispatch('keydown', event);
  f.document.dispatch('keydown', event);
  assert.equal(f.elements.code.value, '0');
  f.document.dispatch('keyup', event);
  f.document.dispatch('keydown', event);
  assert.equal(f.elements.code.value, '00');
});

test('timeout allows retry; host delivers each session only once', () => {
  const f = createFixture({ acknowledge: false });
  for (const key of [48, 49, 50, 51]) f.key(key);
  f.buttons[12].dispatch('click', {});
  f.buttons[12].dispatch('click', {});
  f.flush();
  assert.deepEqual(f.codes, ['0123']);
  assert.deepEqual(f.successMessages, []);
  for (const fn of [...f.timers.values()]) fn();
  assert.equal(f.elements.submit.disabled, false);
  assert.match(f.elements.status.textContent, /Нет ответа/);
  f.buttons[12].dispatch('click', {});
  f.flush();
  assert.deepEqual(f.codes, ['0123']);
  assert.deepEqual(f.successMessages, []);
});

test('back keys cancel; unrecognized keys remain available to host', () => {
  for (const code of [8, 27, 461, 10009]) {
    const f = createFixture();
    assert.equal(f.key(code), true);
    assert.equal(f.canceled(), 1);
  }
  const f = createFixture();
  assert.equal(f.key(65), false);
  f.child.dispatch('message', { source: f.parent, origin: 'https://tv.example', data: { channel: 'tv-code', version: 1, type: 'key', sessionId: 'session-1', keyCode: 461 } });
  f.flush();
  assert.equal(f.canceled(), 1);
});

test('rejects forged sources, origins, session IDs and malformed codes', () => {
  const f = createFixture();
  const valid = { channel: 'tv-code', version: 1, type: 'submit', sessionId: 'session-1', code: '0000' };
  for (const event of [
    { source: {}, origin: 'https://user.github.io', data: valid },
    { source: f.child, origin: 'https://evil.example', data: valid },
    { source: f.child, origin: 'https://user.github.io', data: { ...valid, sessionId: 'other' } },
    { source: f.child, origin: 'https://user.github.io', data: { ...valid, code: 1234 } },
    { source: f.child, origin: 'https://user.github.io', data: { ...valid, code: '12345' } },
    { source: f.child, origin: 'https://user.github.io', data: null }
  ]) f.parent.dispatch('message', event);
  assert.deepEqual(f.codes, []);
  for (const origin of ['https://evil.example', 'https://tv.example']) {
    f.child.dispatch('message', { source: origin.includes('evil') ? f.parent : {}, origin, data: { ...valid, type: 'key', keyCode: 49 } });
  }
  assert.equal(f.elements.code.value, '');
});

test('opaque parent needs explicit opt-in', () => {
  for (const allowOpaque of [false, true]) {
    const f = createFixture({ opaque: true, allowOpaque });
    for (const key of [48, 49, 50, 51]) f.key(key);
    f.buttons[12].dispatch('click', {});
    f.flush();
    assert.equal(f.codes.length, allowOpaque ? 1 : 0);
  }
});

test('destroy removes host listeners; reopening starts with empty input', () => {
  const f = createFixture();
  f.key(49);
  f.host.destroy();
  assert.equal(f.parent.listeners.message.length, 0);
  assert.equal(f.parent.listeners.keydown.length, 0);
  assert.equal(f.frame.listeners.load.length, 0);
  assert.equal(createFixture().elements.code.value, '');
});
