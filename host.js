(function (root) {
  'use strict';

  function createHost(options) {
    var frame = options.frame;
    var sessionId = options.sessionId;
    var origin = options.origin;
    var ready = false;
    var accepted = false;
    var pressed = {};
    var destroyed = false;
    var readyTimer = null;

    function send(type, extra) {
      var message = { channel: 'tv-code', version: 1, type: type, sessionId: sessionId };
      if (extra) {
        message.keyCode = extra.keyCode;
        message.repeat = extra.repeat;
      }
      frame.contentWindow.postMessage(message, origin);
    }

    function init() {
      ready = false;
      accepted = false;
      root.clearTimeout(readyTimer);
      send('init');
      readyTimer = root.setTimeout(function () {
        if (!ready && options.onError) {
          options.onError('WebView не ответил. Проверьте адрес и подключение.');
        }
      }, 10000);
    }

    function receive(event) {
      var data = event.data;
      if (destroyed || event.source !== frame.contentWindow || event.origin !== origin || !root.TVCodeMessaging.isMessage(data) || data.sessionId !== sessionId) {
        return;
      }
      if (data.type === 'ready') {
        ready = true;
        root.clearTimeout(readyTimer);
      } else if (data.type === 'submit' && ready && root.TVCodeCore.isValidCode(data.code)) {
        send('ack');
        if (!accepted) {
          accepted = true;
          options.onCode(data.code);
        }
      } else if (data.type === 'cancel' && ready) {
        options.onCancel();
      }
    }

    function onKeyDown(event) {
      var key = root.TVCodeCore.normalizeKey(event);
      var keyCode = event.keyCode || event.which || 0;
      var repeat = event.repeat === true || pressed[keyCode] === true;
      if (destroyed || !key) {
        return;
      }
      pressed[keyCode] = true;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (key === 'back' || keyCode === 8) {
        if (!repeat) {
          options.onCancel();
        }
        return;
      }
      if (ready) {
        send('key', { keyCode: keyCode, repeat: repeat });
      }
    }

    function onKeyUp(event) {
      delete pressed[event.keyCode || event.which || 0];
    }

    function onBlur() {
      pressed = {};
    }

    function destroy() {
      destroyed = true;
      root.clearTimeout(readyTimer);
      root.removeEventListener('message', receive);
      root.removeEventListener('keydown', onKeyDown, true);
      root.removeEventListener('keyup', onKeyUp, true);
      root.removeEventListener('blur', onBlur);
      frame.removeEventListener('load', init);
    }

    root.addEventListener('message', receive);
    root.addEventListener('keydown', onKeyDown, true);
    root.addEventListener('keyup', onKeyUp, true);
    root.addEventListener('blur', onBlur);
    frame.addEventListener('load', init);
    return { destroy: destroy };
  }

  root.TVCodeHost = { createHost: createHost };
}(window));
