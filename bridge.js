(function (root) {
  'use strict';
  var CHANNEL = 'tv-code';
  var VERSION = 1;

  function isMessage(data) {
    return data !== null && typeof data === 'object' && data.channel === CHANNEL && data.version === VERSION && typeof data.sessionId === 'string' && data.sessionId.length > 0 && data.sessionId.length <= 200;
  }

  function createBridge(options) {
    var sessionId = null;
    var parentOrigin = null;
    var waiting = false;
    var completed = false;
    var timer = null;

    function send(type, extra) {
      var message = { channel: CHANNEL, version: VERSION, type: type, sessionId: sessionId };
      if (!sessionId) {
        return false;
      }
      if (extra) {
        message.code = extra;
      }
      options.parent.postMessage(message, parentOrigin === 'null' ? '*' : parentOrigin);
      return true;
    }

    function receive(event) {
      var data = event.data;
      if (event.source !== options.parent || !isMessage(data)) {
        return;
      }
      if (data.type === 'init') {
        if (sessionId && (data.sessionId !== sessionId || event.origin !== parentOrigin)) {
          return;
        }
        if (!/^https?:\/\//.test(event.origin) && !(event.origin === 'null' && options.allowOpaque)) {
          return;
        }
        sessionId = data.sessionId;
        parentOrigin = event.origin;
        send('ready');
        return;
      }
      if (!sessionId || data.sessionId !== sessionId || event.origin !== parentOrigin) {
        return;
      }
      if (data.type === 'key' && typeof data.keyCode === 'number' && isFinite(data.keyCode) && Math.floor(data.keyCode) === data.keyCode && !waiting && !completed) {
        options.onKey({ keyCode: data.keyCode, repeat: data.repeat === true, fromParent: true });
      }
      if (data.type === 'ack' && waiting) {
        options.clearTimeout(timer);
        waiting = false;
        completed = true;
        options.onState('success');
      }
    }

    function submit(code) {
      if (!root.TVCodeCore.isValidCode(code) || waiting || completed) {
        return;
      }
      if (!sessionId) {
        options.onState('disconnected');
        return;
      }
      waiting = true;
      options.onState('waiting');
      timer = options.setTimeout(function () {
        waiting = false;
        options.onState('timeout');
      }, 3000);
      send('submit', code);
    }

    function cancel() {
      if (!send('cancel')) {
        options.onState('disconnected');
      }
    }

    function destroy() {
      options.clearTimeout(timer);
    }

    return { receive: receive, submit: submit, cancel: cancel, destroy: destroy };
  }

  root.TVCodeMessaging = { isMessage: isMessage, createBridge: createBridge };
}(typeof window === 'object' ? window : globalThis));
