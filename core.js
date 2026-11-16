(function (root) {
  'use strict';
  var CODE_LENGTH = 4;
  var SUBMIT_INDEX = 12;
  var BACK_CODES = [27, 461, 10009];

  function normalizeKey(event) {
    var code = event.keyCode || event.which || 0;
    var key = event.key || '';
    var names = { ArrowLeft: 'left', Left: 'left', ArrowRight: 'right', Right: 'right', ArrowUp: 'up', Up: 'up', ArrowDown: 'down', Down: 'down', Enter: 'enter', Escape: 'back', Backspace: 'delete' };
    var codes = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'enter', 8: 'delete', 46: 'delete' };
    if (BACK_CODES.indexOf(code) !== -1) {
      return 'back';
    }
    if (/^[0-9]$/.test(key)) {
      return key;
    }
    if (code >= 48 && code <= 57) {
      return String(code - 48);
    }
    if (code >= 96 && code <= 105) {
      return String(code - 96);
    }
    return names[key] || codes[code] || '';
  }

  function appendDigit(code, digit) {
    if (code.length < CODE_LENGTH && /^[0-9]$/.test(digit)) {
      return code + digit;
    }
    return code;
  }

  function isValidCode(code) {
    return typeof code === 'string' && /^[0-9]{4}$/.test(code);
  }

  function moveFocus(index, direction, canSubmit) {
    var column = index % 3;
    if (index === SUBMIT_INDEX) {
      return direction === 'up' ? 10 : index;
    }
    if (direction === 'left' && column > 0) {
      return index - 1;
    }
    if (direction === 'right' && column < 2) {
      return index + 1;
    }
    if (direction === 'up' && index >= 3) {
      return index - 3;
    }
    if (direction === 'down') {
      if (index < 9) {
        return index + 3;
      }
      return canSubmit ? SUBMIT_INDEX : index;
    }
    return index;
  }

  root.TVCodeCore = { normalizeKey: normalizeKey, appendDigit: appendDigit, isValidCode: isValidCode, moveFocus: moveFocus };
}(typeof window === 'object' ? window : globalThis));
