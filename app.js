(function () {
  'use strict';
  var core = window.TVCodeCore;
  var buttons = document.querySelectorAll('.keypad button, #submit');
  var input = document.getElementById('code');
  var status = document.getElementById('status');
  var submit = document.getElementById('submit');
  var code = '';
  var index = 0;
  var locked = false;
  var pressed = {};
  var allowOpaque = /(?:\?|&)allowOpaqueParent=1(?:&|$)/.test(window.location.search);
  var bridge = window.TVCodeMessaging.createBridge({
    parent: window.parent,
    allowOpaque: allowOpaque,
    onKey: onKey,
    onState: onState,
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window)
  });

  function render() {
    var i = 0;
    input.value = code;
    for (i = 0; i < buttons.length - 1; i += 1) {
      buttons[i].disabled = locked;
    }
    submit.disabled = locked || !core.isValidCode(code);
  }

  function focusButton(next) {
    index = next;
    if (!buttons[index].disabled) {
      buttons[index].focus();
    }
  }

  function onState(state) {
    var messages = { waiting: 'Отправка…', success: 'Код получен приложением', timeout: 'Нет ответа. Попробуйте отправить ещё раз', disconnected: 'Нет соединения с приложением. Откройте пример подключения' };
    locked = state === 'waiting' || state === 'success';
    status.textContent = messages[state];
    render();
    if (state === 'timeout') {
      focusButton(12);
    }
  }

  function activate(selected) {
    var digit = buttons[selected].getAttribute('data-digit');
    var action = buttons[selected].getAttribute('data-action');
    if (locked) {
      return;
    }
    if (selected === 12) {
      bridge.submit(code);
      return;
    }
    if (digit !== null) {
      code = core.appendDigit(code, digit);
    } else if (action === 'clear') {
      code = '';
    } else if (action === 'delete') {
      code = code.slice(0, -1);
    }
    status.textContent = core.isValidCode(code) ? 'Код готов к отправке' : 'Введите 4 цифры';
    render();
  }

  function onKey(event) {
    var key = core.normalizeKey(event);
    var keyId = event.keyCode || event.key || '';
    var repeat = event.repeat === true || (!event.fromParent && pressed[keyId] === true);
    if (event.fromParent && event.keyCode === 8) {
      key = 'back';
    } else if (event.keyCode === 8 && /VIDAA|Hisense/i.test(navigator.userAgent)) {
      key = 'back';
    }
    if (!key) {
      return;
    }
    if (!event.fromParent) {
      pressed[keyId] = true;
    }
    if (event.preventDefault) {
      event.preventDefault();
    }
    if (event.stopPropagation) {
      event.stopPropagation();
    }
    if (key === 'back') {
      bridge.cancel();
      return;
    }
    if (locked) {
      return;
    }
    if (key === 'left' || key === 'right' || key === 'up' || key === 'down') {
      focusButton(core.moveFocus(index, key, !submit.disabled));
      return;
    }
    if (repeat) {
      return;
    }
    if (key === 'enter') {
      activate(index);
    } else if (key === 'delete') {
      code = code.slice(0, -1);
      render();
      status.textContent = 'Введите 4 цифры';
      if (index === 12) {
        focusButton(11);
      }
    } else if (/^[0-9]$/.test(key)) {
      code = core.appendDigit(code, key);
      render();
      status.textContent = core.isValidCode(code) ? 'Код готов к отправке' : 'Введите 4 цифры';
    }
  }

  function bindButton(buttonIndex) {
    buttons[buttonIndex].addEventListener('focus', function () {
      index = buttonIndex;
    });
    buttons[buttonIndex].addEventListener('click', function () {
      index = buttonIndex;
      activate(buttonIndex);
    });
  }

  var i = 0;
  for (i = 0; i < buttons.length; i += 1) {
    bindButton(i);
  }
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', function (event) {
    delete pressed[event.keyCode || event.key || ''];
  });
  window.addEventListener('blur', function () {
    pressed = {};
  });
  window.addEventListener('message', bridge.receive);
  window.addEventListener('unload', bridge.destroy);
  render();
  focusButton(0);
}());
