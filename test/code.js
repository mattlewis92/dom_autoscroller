(function () {
	'use strict';

	var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

	var atoa = function atoa (a, n) { return Array.prototype.slice.call(a, n); };

	var si = typeof setImmediate === 'function', tick;
	if (si) {
	  tick = function (fn) { setImmediate(fn); };
	} else if (typeof process !== 'undefined' && process.nextTick) {
	  tick = process.nextTick;
	} else {
	  tick = function (fn) { setTimeout(fn, 0); };
	}

	var ticky = tick;

	var debounce = function debounce (fn, args, ctx) {
	  if (!fn) { return; }
	  ticky(function run () {
	    fn.apply(ctx || null, args || []);
	  });
	};

	var emitter = function emitter (thing, options) {
	  var opts = options || {};
	  var evt = {};
	  if (thing === undefined) { thing = {}; }
	  thing.on = function (type, fn) {
	    if (!evt[type]) {
	      evt[type] = [fn];
	    } else {
	      evt[type].push(fn);
	    }
	    return thing;
	  };
	  thing.once = function (type, fn) {
	    fn._once = true; // thing.off(fn) still works!
	    thing.on(type, fn);
	    return thing;
	  };
	  thing.off = function (type, fn) {
	    var c = arguments.length;
	    if (c === 1) {
	      delete evt[type];
	    } else if (c === 0) {
	      evt = {};
	    } else {
	      var et = evt[type];
	      if (!et) { return thing; }
	      et.splice(et.indexOf(fn), 1);
	    }
	    return thing;
	  };
	  thing.emit = function () {
	    var args = atoa(arguments);
	    return thing.emitterSnapshot(args.shift()).apply(this, args);
	  };
	  thing.emitterSnapshot = function (type) {
	    var et = (evt[type] || []).slice(0);
	    return function () {
	      var args = atoa(arguments);
	      var ctx = this || thing;
	      if (type === 'error' && opts.throws !== false && !et.length) { throw args.length === 1 ? args[0] : args; }
	      et.forEach(function emitter (listen) {
	        if (opts.async) { debounce(listen, args, ctx); } else { listen.apply(ctx, args); }
	        if (listen._once) { thing.off(type, listen); }
	      });
	      return thing;
	    };
	  };
	  return thing;
	};

	var NativeCustomEvent = commonjsGlobal.CustomEvent;

	function useNative () {
	  try {
	    var p = new NativeCustomEvent('cat', { detail: { foo: 'bar' } });
	    return  'cat' === p.type && 'bar' === p.detail.foo;
	  } catch (e) {
	  }
	  return false;
	}

	/**
	 * Cross-browser `CustomEvent` constructor.
	 *
	 * https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent.CustomEvent
	 *
	 * @public
	 */

	var customEvent = useNative() ? NativeCustomEvent :

	// IE >= 9
	'function' === typeof document.createEvent ? function CustomEvent (type, params) {
	  var e = document.createEvent('CustomEvent');
	  if (params) {
	    e.initCustomEvent(type, params.bubbles, params.cancelable, params.detail);
	  } else {
	    e.initCustomEvent(type, false, false, void 0);
	  }
	  return e;
	} :

	// IE <= 8
	function CustomEvent (type, params) {
	  var e = document.createEventObject();
	  e.type = type;
	  if (params) {
	    e.bubbles = Boolean(params.bubbles);
	    e.cancelable = Boolean(params.cancelable);
	    e.detail = params.detail;
	  } else {
	    e.bubbles = false;
	    e.cancelable = false;
	    e.detail = void 0;
	  }
	  return e;
	};

	var eventmap = [];
	var eventname = '';
	var ron = /^on/;

	for (eventname in commonjsGlobal) {
	  if (ron.test(eventname)) {
	    eventmap.push(eventname.slice(2));
	  }
	}

	var eventmap_1 = eventmap;

	var doc = commonjsGlobal.document;
	var addEvent = addEventEasy;
	var removeEvent = removeEventEasy;
	var hardCache = [];

	if (!commonjsGlobal.addEventListener) {
	  addEvent = addEventHard;
	  removeEvent = removeEventHard;
	}

	var crossvent = {
	  add: addEvent,
	  remove: removeEvent,
	  fabricate: fabricateEvent
	};

	function addEventEasy (el, type, fn, capturing) {
	  return el.addEventListener(type, fn, capturing);
	}

	function addEventHard (el, type, fn) {
	  return el.attachEvent('on' + type, wrap(el, type, fn));
	}

	function removeEventEasy (el, type, fn, capturing) {
	  return el.removeEventListener(type, fn, capturing);
	}

	function removeEventHard (el, type, fn) {
	  var listener = unwrap(el, type, fn);
	  if (listener) {
	    return el.detachEvent('on' + type, listener);
	  }
	}

	function fabricateEvent (el, type, model) {
	  var e = eventmap_1.indexOf(type) === -1 ? makeCustomEvent() : makeClassicEvent();
	  if (el.dispatchEvent) {
	    el.dispatchEvent(e);
	  } else {
	    el.fireEvent('on' + type, e);
	  }
	  function makeClassicEvent () {
	    var e;
	    if (doc.createEvent) {
	      e = doc.createEvent('Event');
	      e.initEvent(type, true, true);
	    } else if (doc.createEventObject) {
	      e = doc.createEventObject();
	    }
	    return e;
	  }
	  function makeCustomEvent () {
	    return new customEvent(type, { detail: model });
	  }
	}

	function wrapperFactory (el, type, fn) {
	  return function wrapper (originalEvent) {
	    var e = originalEvent || commonjsGlobal.event;
	    e.target = e.target || e.srcElement;
	    e.preventDefault = e.preventDefault || function preventDefault () { e.returnValue = false; };
	    e.stopPropagation = e.stopPropagation || function stopPropagation () { e.cancelBubble = true; };
	    e.which = e.which || e.keyCode;
	    fn.call(el, e);
	  };
	}

	function wrap (el, type, fn) {
	  var wrapper = unwrap(el, type, fn) || wrapperFactory(el, type, fn);
	  hardCache.push({
	    wrapper: wrapper,
	    element: el,
	    type: type,
	    fn: fn
	  });
	  return wrapper;
	}

	function unwrap (el, type, fn) {
	  var i = find(el, type, fn);
	  if (i) {
	    var wrapper = hardCache[i].wrapper;
	    hardCache.splice(i, 1); // free up a tad of memory
	    return wrapper;
	  }
	}

	function find (el, type, fn) {
	  var i, item;
	  for (i = 0; i < hardCache.length; i++) {
	    item = hardCache[i];
	    if (item.element === el && item.type === type && item.fn === fn) {
	      return i;
	    }
	  }
	}

	var cache = {};
	var start = '(?:^|\\s)';
	var end = '(?:\\s|$)';

	function lookupClass (className) {
	  var cached = cache[className];
	  if (cached) {
	    cached.lastIndex = 0;
	  } else {
	    cache[className] = cached = new RegExp(start + className + end, 'g');
	  }
	  return cached;
	}

	function addClass (el, className) {
	  var current = el.className;
	  if (!current.length) {
	    el.className = className;
	  } else if (!lookupClass(className).test(current)) {
	    el.className += ' ' + className;
	  }
	}

	function rmClass (el, className) {
	  el.className = el.className.replace(lookupClass(className), ' ').trim();
	}

	var classes = {
	  add: addClass,
	  rm: rmClass
	};

	var doc$1 = document;
	var documentElement = doc$1.documentElement;

	function dragula (initialContainers, options) {
	  var len = arguments.length;
	  if (len === 1 && Array.isArray(initialContainers) === false) {
	    options = initialContainers;
	    initialContainers = [];
	  }
	  var _mirror; // mirror image
	  var _source; // source container
	  var _item; // item being dragged
	  var _offsetX; // reference x
	  var _offsetY; // reference y
	  var _moveX; // reference move x
	  var _moveY; // reference move y
	  var _initialSibling; // reference sibling when grabbed
	  var _currentSibling; // reference sibling now
	  var _copy; // item used for copying
	  var _renderTimer; // timer for setTimeout renderMirrorImage
	  var _lastDropTarget = null; // last container item was over
	  var _grabbed; // holds mousedown context until first mousemove

	  var o = options || {};
	  if (o.moves === void 0) { o.moves = always; }
	  if (o.accepts === void 0) { o.accepts = always; }
	  if (o.invalid === void 0) { o.invalid = invalidTarget; }
	  if (o.containers === void 0) { o.containers = initialContainers || []; }
	  if (o.isContainer === void 0) { o.isContainer = never; }
	  if (o.copy === void 0) { o.copy = false; }
	  if (o.copySortSource === void 0) { o.copySortSource = false; }
	  if (o.revertOnSpill === void 0) { o.revertOnSpill = false; }
	  if (o.removeOnSpill === void 0) { o.removeOnSpill = false; }
	  if (o.direction === void 0) { o.direction = 'vertical'; }
	  if (o.ignoreInputTextSelection === void 0) { o.ignoreInputTextSelection = true; }
	  if (o.mirrorContainer === void 0) { o.mirrorContainer = doc$1.body; }

	  var drake = emitter({
	    containers: o.containers,
	    start: manualStart,
	    end: end,
	    cancel: cancel,
	    remove: remove,
	    destroy: destroy,
	    canMove: canMove,
	    dragging: false
	  });

	  if (o.removeOnSpill === true) {
	    drake.on('over', spillOver).on('out', spillOut);
	  }

	  events();

	  return drake;

	  function isContainer (el) {
	    return drake.containers.indexOf(el) !== -1 || o.isContainer(el);
	  }

	  function events (remove) {
	    var op = remove ? 'remove' : 'add';
	    touchy(documentElement, op, 'mousedown', grab);
	    touchy(documentElement, op, 'mouseup', release);
	  }

	  function eventualMovements (remove) {
	    var op = remove ? 'remove' : 'add';
	    touchy(documentElement, op, 'mousemove', startBecauseMouseMoved);
	  }

	  function movements (remove) {
	    var op = remove ? 'remove' : 'add';
	    crossvent[op](documentElement, 'selectstart', preventGrabbed); // IE8
	    crossvent[op](documentElement, 'click', preventGrabbed);
	  }

	  function destroy () {
	    events(true);
	    release({});
	  }

	  function preventGrabbed (e) {
	    if (_grabbed) {
	      e.preventDefault();
	    }
	  }

	  function grab (e) {
	    _moveX = e.clientX;
	    _moveY = e.clientY;

	    var ignore = whichMouseButton(e) !== 1 || e.metaKey || e.ctrlKey;
	    if (ignore) {
	      return; // we only care about honest-to-god left clicks and touch events
	    }
	    var item = e.target;
	    var context = canStart(item);
	    if (!context) {
	      return;
	    }
	    _grabbed = context;
	    eventualMovements();
	    if (e.type === 'mousedown') {
	      if (isInput(item)) { // see also: https://github.com/bevacqua/dragula/issues/208
	        item.focus(); // fixes https://github.com/bevacqua/dragula/issues/176
	      } else {
	        e.preventDefault(); // fixes https://github.com/bevacqua/dragula/issues/155
	      }
	    }
	  }

	  function startBecauseMouseMoved (e) {
	    if (!_grabbed) {
	      return;
	    }
	    if (whichMouseButton(e) === 0) {
	      release({});
	      return; // when text is selected on an input and then dragged, mouseup doesn't fire. this is our only hope
	    }
	    // truthy check fixes #239, equality fixes #207
	    if (e.clientX !== void 0 && e.clientX === _moveX && e.clientY !== void 0 && e.clientY === _moveY) {
	      return;
	    }
	    if (o.ignoreInputTextSelection) {
	      var clientX = getCoord('clientX', e);
	      var clientY = getCoord('clientY', e);
	      var elementBehindCursor = doc$1.elementFromPoint(clientX, clientY);
	      if (isInput(elementBehindCursor)) {
	        return;
	      }
	    }

	    var grabbed = _grabbed; // call to end() unsets _grabbed
	    eventualMovements(true);
	    movements();
	    end();
	    start(grabbed);

	    var offset = getOffset(_item);
	    _offsetX = getCoord('pageX', e) - offset.left;
	    _offsetY = getCoord('pageY', e) - offset.top;

	    classes.add(_copy || _item, 'gu-transit');
	    renderMirrorImage();
	    drag(e);
	  }

	  function canStart (item) {
	    if (drake.dragging && _mirror) {
	      return;
	    }
	    if (isContainer(item)) {
	      return; // don't drag container itself
	    }
	    var handle = item;
	    while (getParent(item) && isContainer(getParent(item)) === false) {
	      if (o.invalid(item, handle)) {
	        return;
	      }
	      item = getParent(item); // drag target should be a top element
	      if (!item) {
	        return;
	      }
	    }
	    var source = getParent(item);
	    if (!source) {
	      return;
	    }
	    if (o.invalid(item, handle)) {
	      return;
	    }

	    var movable = o.moves(item, source, handle, nextEl(item));
	    if (!movable) {
	      return;
	    }

	    return {
	      item: item,
	      source: source
	    };
	  }

	  function canMove (item) {
	    return !!canStart(item);
	  }

	  function manualStart (item) {
	    var context = canStart(item);
	    if (context) {
	      start(context);
	    }
	  }

	  function start (context) {
	    if (isCopy(context.item, context.source)) {
	      _copy = context.item.cloneNode(true);
	      drake.emit('cloned', _copy, context.item, 'copy');
	    }

	    _source = context.source;
	    _item = context.item;
	    _initialSibling = _currentSibling = nextEl(context.item);

	    drake.dragging = true;
	    drake.emit('drag', _item, _source);
	  }

	  function invalidTarget () {
	    return false;
	  }

	  function end () {
	    if (!drake.dragging) {
	      return;
	    }
	    var item = _copy || _item;
	    drop(item, getParent(item));
	  }

	  function ungrab () {
	    _grabbed = false;
	    eventualMovements(true);
	    movements(true);
	  }

	  function release (e) {
	    ungrab();

	    if (!drake.dragging) {
	      return;
	    }
	    var item = _copy || _item;
	    var clientX = getCoord('clientX', e);
	    var clientY = getCoord('clientY', e);
	    var elementBehindCursor = getElementBehindPoint(_mirror, clientX, clientY);
	    var dropTarget = findDropTarget(elementBehindCursor, clientX, clientY);
	    if (dropTarget && ((_copy && o.copySortSource) || (!_copy || dropTarget !== _source))) {
	      drop(item, dropTarget);
	    } else if (o.removeOnSpill) {
	      remove();
	    } else {
	      cancel();
	    }
	  }

	  function drop (item, target) {
	    var parent = getParent(item);
	    if (_copy && o.copySortSource && target === _source) {
	      parent.removeChild(_item);
	    }
	    if (isInitialPlacement(target)) {
	      drake.emit('cancel', item, _source, _source);
	    } else {
	      drake.emit('drop', item, target, _source, _currentSibling);
	    }
	    cleanup();
	  }

	  function remove () {
	    if (!drake.dragging) {
	      return;
	    }
	    var item = _copy || _item;
	    var parent = getParent(item);
	    if (parent) {
	      parent.removeChild(item);
	    }
	    drake.emit(_copy ? 'cancel' : 'remove', item, parent, _source);
	    cleanup();
	  }

	  function cancel (revert) {
	    if (!drake.dragging) {
	      return;
	    }
	    var reverts = arguments.length > 0 ? revert : o.revertOnSpill;
	    var item = _copy || _item;
	    var parent = getParent(item);
	    var initial = isInitialPlacement(parent);
	    if (initial === false && reverts) {
	      if (_copy) {
	        if (parent) {
	          parent.removeChild(_copy);
	        }
	      } else {
	        _source.insertBefore(item, _initialSibling);
	      }
	    }
	    if (initial || reverts) {
	      drake.emit('cancel', item, _source, _source);
	    } else {
	      drake.emit('drop', item, parent, _source, _currentSibling);
	    }
	    cleanup();
	  }

	  function cleanup () {
	    var item = _copy || _item;
	    ungrab();
	    removeMirrorImage();
	    if (item) {
	      classes.rm(item, 'gu-transit');
	    }
	    if (_renderTimer) {
	      clearTimeout(_renderTimer);
	    }
	    drake.dragging = false;
	    if (_lastDropTarget) {
	      drake.emit('out', item, _lastDropTarget, _source);
	    }
	    drake.emit('dragend', item);
	    _source = _item = _copy = _initialSibling = _currentSibling = _renderTimer = _lastDropTarget = null;
	  }

	  function isInitialPlacement (target, s) {
	    var sibling;
	    if (s !== void 0) {
	      sibling = s;
	    } else if (_mirror) {
	      sibling = _currentSibling;
	    } else {
	      sibling = nextEl(_copy || _item);
	    }
	    return target === _source && sibling === _initialSibling;
	  }

	  function findDropTarget (elementBehindCursor, clientX, clientY) {
	    var target = elementBehindCursor;
	    while (target && !accepted()) {
	      target = getParent(target);
	    }
	    return target;

	    function accepted () {
	      var droppable = isContainer(target);
	      if (droppable === false) {
	        return false;
	      }

	      var immediate = getImmediateChild(target, elementBehindCursor);
	      var reference = getReference(target, immediate, clientX, clientY);
	      var initial = isInitialPlacement(target, reference);
	      if (initial) {
	        return true; // should always be able to drop it right back where it was
	      }
	      return o.accepts(_item, target, _source, reference);
	    }
	  }

	  function drag (e) {
	    if (!_mirror) {
	      return;
	    }
	    e.preventDefault();

	    var clientX = getCoord('clientX', e);
	    var clientY = getCoord('clientY', e);
	    var x = clientX - _offsetX;
	    var y = clientY - _offsetY;

	    _mirror.style.left = x + 'px';
	    _mirror.style.top = y + 'px';

	    var item = _copy || _item;
	    var elementBehindCursor = getElementBehindPoint(_mirror, clientX, clientY);
	    var dropTarget = findDropTarget(elementBehindCursor, clientX, clientY);
	    var changed = dropTarget !== null && dropTarget !== _lastDropTarget;
	    if (changed || dropTarget === null) {
	      out();
	      _lastDropTarget = dropTarget;
	      over();
	    }
	    var parent = getParent(item);
	    if (dropTarget === _source && _copy && !o.copySortSource) {
	      if (parent) {
	        parent.removeChild(item);
	      }
	      return;
	    }
	    var reference;
	    var immediate = getImmediateChild(dropTarget, elementBehindCursor);
	    if (immediate !== null) {
	      reference = getReference(dropTarget, immediate, clientX, clientY);
	    } else if (o.revertOnSpill === true && !_copy) {
	      reference = _initialSibling;
	      dropTarget = _source;
	    } else {
	      if (_copy && parent) {
	        parent.removeChild(item);
	      }
	      return;
	    }
	    if (
	      (reference === null && changed) ||
	      reference !== item &&
	      reference !== nextEl(item)
	    ) {
	      _currentSibling = reference;
	      dropTarget.insertBefore(item, reference);
	      drake.emit('shadow', item, dropTarget, _source);
	    }
	    function moved (type) { drake.emit(type, item, _lastDropTarget, _source); }
	    function over () { if (changed) { moved('over'); } }
	    function out () { if (_lastDropTarget) { moved('out'); } }
	  }

	  function spillOver (el) {
	    classes.rm(el, 'gu-hide');
	  }

	  function spillOut (el) {
	    if (drake.dragging) { classes.add(el, 'gu-hide'); }
	  }

	  function renderMirrorImage () {
	    if (_mirror) {
	      return;
	    }
	    var rect = _item.getBoundingClientRect();
	    _mirror = _item.cloneNode(true);
	    _mirror.style.width = getRectWidth(rect) + 'px';
	    _mirror.style.height = getRectHeight(rect) + 'px';
	    classes.rm(_mirror, 'gu-transit');
	    classes.add(_mirror, 'gu-mirror');
	    o.mirrorContainer.appendChild(_mirror);
	    touchy(documentElement, 'add', 'mousemove', drag);
	    classes.add(o.mirrorContainer, 'gu-unselectable');
	    drake.emit('cloned', _mirror, _item, 'mirror');
	  }

	  function removeMirrorImage () {
	    if (_mirror) {
	      classes.rm(o.mirrorContainer, 'gu-unselectable');
	      touchy(documentElement, 'remove', 'mousemove', drag);
	      getParent(_mirror).removeChild(_mirror);
	      _mirror = null;
	    }
	  }

	  function getImmediateChild (dropTarget, target) {
	    var immediate = target;
	    while (immediate !== dropTarget && getParent(immediate) !== dropTarget) {
	      immediate = getParent(immediate);
	    }
	    if (immediate === documentElement) {
	      return null;
	    }
	    return immediate;
	  }

	  function getReference (dropTarget, target, x, y) {
	    var horizontal = o.direction === 'horizontal';
	    var reference = target !== dropTarget ? inside() : outside();
	    return reference;

	    function outside () { // slower, but able to figure out any position
	      var len = dropTarget.children.length;
	      var i;
	      var el;
	      var rect;
	      for (i = 0; i < len; i++) {
	        el = dropTarget.children[i];
	        rect = el.getBoundingClientRect();
	        if (horizontal && (rect.left + rect.width / 2) > x) { return el; }
	        if (!horizontal && (rect.top + rect.height / 2) > y) { return el; }
	      }
	      return null;
	    }

	    function inside () { // faster, but only available if dropped inside a child element
	      var rect = target.getBoundingClientRect();
	      if (horizontal) {
	        return resolve(x > rect.left + getRectWidth(rect) / 2);
	      }
	      return resolve(y > rect.top + getRectHeight(rect) / 2);
	    }

	    function resolve (after) {
	      return after ? nextEl(target) : target;
	    }
	  }

	  function isCopy (item, container) {
	    return typeof o.copy === 'boolean' ? o.copy : o.copy(item, container);
	  }
	}

	function touchy (el, op, type, fn) {
	  var touch = {
	    mouseup: 'touchend',
	    mousedown: 'touchstart',
	    mousemove: 'touchmove'
	  };
	  var pointers = {
	    mouseup: 'pointerup',
	    mousedown: 'pointerdown',
	    mousemove: 'pointermove'
	  };
	  var microsoft = {
	    mouseup: 'MSPointerUp',
	    mousedown: 'MSPointerDown',
	    mousemove: 'MSPointerMove'
	  };
	  if (commonjsGlobal.navigator.pointerEnabled) {
	    crossvent[op](el, pointers[type], fn);
	  } else if (commonjsGlobal.navigator.msPointerEnabled) {
	    crossvent[op](el, microsoft[type], fn);
	  } else {
	    crossvent[op](el, touch[type], fn);
	    crossvent[op](el, type, fn);
	  }
	}

	function whichMouseButton (e) {
	  if (e.touches !== void 0) { return e.touches.length; }
	  if (e.which !== void 0 && e.which !== 0) { return e.which; } // see https://github.com/bevacqua/dragula/issues/261
	  if (e.buttons !== void 0) { return e.buttons; }
	  var button = e.button;
	  if (button !== void 0) { // see https://github.com/jquery/jquery/blob/99e8ff1baa7ae341e94bb89c3e84570c7c3ad9ea/src/event.js#L573-L575
	    return button & 1 ? 1 : button & 2 ? 3 : (button & 4 ? 2 : 0);
	  }
	}

	function getOffset (el) {
	  var rect = el.getBoundingClientRect();
	  return {
	    left: rect.left + getScroll('scrollLeft', 'pageXOffset'),
	    top: rect.top + getScroll('scrollTop', 'pageYOffset')
	  };
	}

	function getScroll (scrollProp, offsetProp) {
	  if (typeof commonjsGlobal[offsetProp] !== 'undefined') {
	    return commonjsGlobal[offsetProp];
	  }
	  if (documentElement.clientHeight) {
	    return documentElement[scrollProp];
	  }
	  return doc$1.body[scrollProp];
	}

	function getElementBehindPoint (point, x, y) {
	  var p = point || {};
	  var state = p.className;
	  var el;
	  p.className += ' gu-hide';
	  el = doc$1.elementFromPoint(x, y);
	  p.className = state;
	  return el;
	}

	function never () { return false; }
	function always () { return true; }
	function getRectWidth (rect) { return rect.width || (rect.right - rect.left); }
	function getRectHeight (rect) { return rect.height || (rect.bottom - rect.top); }
	function getParent (el) { return el.parentNode === doc$1 ? null : el.parentNode; }
	function isInput (el) { return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || isEditable(el); }
	function isEditable (el) {
	  if (!el) { return false; } // no parents were editable
	  if (el.contentEditable === 'false') { return false; } // stop the lookup
	  if (el.contentEditable === 'true') { return true; } // found a contentEditable element in the chain
	  return isEditable(getParent(el)); // contentEditable is set to 'inherit'
	}

	function nextEl (el) {
	  return el.nextElementSibling || manually();
	  function manually () {
	    var sibling = el;
	    do {
	      sibling = sibling.nextSibling;
	    } while (sibling && sibling.nodeType !== 1);
	    return sibling;
	  }
	}

	function getEventHost (e) {
	  // on touchend event, we have to use `e.changedTouches`
	  // see http://stackoverflow.com/questions/7192563/touchend-event-properties
	  // see https://github.com/bevacqua/dragula/issues/34
	  if (e.targetTouches && e.targetTouches.length) {
	    return e.targetTouches[0];
	  }
	  if (e.changedTouches && e.changedTouches.length) {
	    return e.changedTouches[0];
	  }
	  return e;
	}

	function getCoord (coord, e) {
	  var host = getEventHost(e);
	  var missMap = {
	    pageX: 'clientX', // IE8
	    pageY: 'clientY' // IE8
	  };
	  if (coord in missMap && !(coord in host) && missMap[coord] in host) {
	    coord = missMap[coord];
	  }
	  return host[coord];
	}

	var dragula_1 = dragula;

	function getDef(f, d) {
	    if (typeof f === 'undefined') {
	        return typeof d === 'undefined' ? f : d;
	    }

	    return f;
	}
	function boolean(func, def) {

	    func = getDef(func, def);

	    if (typeof func === 'function') {
	        return function f() {
	            var arguments$1 = arguments;

	            for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
	                args[_key] = arguments$1[_key];
	            }

	            return !!func.apply(this, args);
	        };
	    }

	    return !!func ? function () {
	        return true;
	    } : function () {
	        return false;
	    };
	}

	var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

	/**
	 * Returns `true` if provided input is Element.
	 * @name isElement
	 * @param {*} [input]
	 * @returns {boolean}
	 */
	var isElement$1 = function (input) {
	  return input != null && (typeof input === 'undefined' ? 'undefined' : _typeof(input)) === 'object' && input.nodeType === 1 && _typeof(input.style) === 'object' && _typeof(input.ownerDocument) === 'object';
	};

	function indexOfElement(elements, element){
	    element = resolveElement(element, true);
	    if(!isElement$1(element)) { return -1; }
	    for(var i=0; i<elements.length; i++){
	        if(elements[i] === element){
	            return i;
	        }
	    }
	    return -1;
	}

	function hasElement(elements, element){
	    return -1 !== indexOfElement(elements, element);
	}

	function pushElements(elements, toAdd){

	    for(var i=0; i<toAdd.length; i++){
	        if(!hasElement(elements, toAdd[i]))
	            { elements.push(toAdd[i]); }
	    }

	    return toAdd;
	}

	function addElements(elements){
	    var arguments$1 = arguments;

	    var toAdd = [], len = arguments.length - 1;
	    while ( len-- > 0 ) { toAdd[ len ] = arguments$1[ len + 1 ]; }

	    toAdd = toAdd.map(resolveElement);
	    return pushElements(elements, toAdd);
	}

	function removeElements(elements){
	    var arguments$1 = arguments;

	    var toRemove = [], len = arguments.length - 1;
	    while ( len-- > 0 ) { toRemove[ len ] = arguments$1[ len + 1 ]; }

	    return toRemove.map(resolveElement).reduce(function (last, e){

	        var index = indexOfElement(elements, e);

	        if(index !== -1)
	            { return last.concat(elements.splice(index, 1)); }
	        return last;
	    }, []);
	}

	function resolveElement(element, noThrow){
	    if(typeof element === 'string'){
	        try{
	            return document.querySelector(element);
	        }catch(e){
	            throw e;
	        }

	    }

	    if(!isElement$1(element) && !noThrow){
	        throw new TypeError((element + " is not a DOM element."));
	    }
	    return element;
	}

	function createPointCB(object, options) {

	    // A persistent object (as opposed to returned object) is used to save memory
	    // This is good to prevent layout thrashing, or for games, and such

	    // NOTE
	    // This uses IE fixes which should be OK to remove some day. :)
	    // Some speed will be gained by removal of these.

	    // pointCB should be saved in a variable on return
	    // This allows the usage of element.removeEventListener

	    options = options || {};

	    var allowUpdate = boolean(options.allowUpdate, true);

	    /*if(typeof options.allowUpdate === 'function'){
	        allowUpdate = options.allowUpdate;
	    }else{
	        allowUpdate = function(){return true;};
	    }*/

	    return function pointCB(event) {

	        event = event || window.event; // IE-ism
	        object.target = event.target || event.srcElement || event.originalTarget;
	        object.element = this;
	        object.type = event.type;

	        if (!allowUpdate(event)) {
	            return;
	        }

	        // Support touch
	        // http://www.creativebloq.com/javascript/make-your-site-work-touch-devices-51411644

	        if (event.targetTouches) {
	            object.x = event.targetTouches[0].clientX;
	            object.y = event.targetTouches[0].clientY;
	            object.pageX = event.targetTouches[0].pageX;
	            object.pageY = event.targetTouches[0].pageY;
	            object.screenX = event.targetTouches[0].screenX;
	            object.screenY = event.targetTouches[0].screenY;
	        } else {

	            // If pageX/Y aren't available and clientX/Y are,
	            // calculate pageX/Y - logic taken from jQuery.
	            // (This is to support old IE)
	            // NOTE Hopefully this can be removed soon.

	            if (event.pageX === null && event.clientX !== null) {
	                var eventDoc = event.target && event.target.ownerDocument || document;
	                var doc = eventDoc.documentElement;
	                var body = eventDoc.body;

	                object.pageX = event.clientX + (doc && doc.scrollLeft || body && body.scrollLeft || 0) - (doc && doc.clientLeft || body && body.clientLeft || 0);
	                object.pageY = event.clientY + (doc && doc.scrollTop || body && body.scrollTop || 0) - (doc && doc.clientTop || body && body.clientTop || 0);
	            } else {
	                object.pageX = event.pageX;
	                object.pageY = event.pageY;
	            }

	            // pageX, and pageY change with page scroll
	            // so we're not going to use those for x, and y.
	            // NOTE Most browsers also alias clientX/Y with x/y
	            // so that's something to consider down the road.

	            object.x = event.clientX;
	            object.y = event.clientY;

	            object.screenX = event.screenX;
	            object.screenY = event.screenY;
	        }

	        object.clientX = object.x;
	        object.clientY = object.y;
	    };

	    //NOTE Remember accessibility, Aria roles, and labels.
	}

	function createWindowRect() {
	    var props = {
	        top: { value: 0, enumerable: true },
	        left: { value: 0, enumerable: true },
	        right: { value: window.innerWidth, enumerable: true },
	        bottom: { value: window.innerHeight, enumerable: true },
	        width: { value: window.innerWidth, enumerable: true },
	        height: { value: window.innerHeight, enumerable: true },
	        x: { value: 0, enumerable: true },
	        y: { value: 0, enumerable: true }
	    };

	    if (Object.create) {
	        return Object.create({}, props);
	    } else {
	        var rect = {};
	        Object.defineProperties(rect, props);
	        return rect;
	    }
	}

	function getClientRect(el) {
	    if (el === window) {
	        return createWindowRect();
	    } else {
	        try {
	            var rect = el.getBoundingClientRect();
	            if (rect.x === undefined) {
	                rect.x = rect.left;
	                rect.y = rect.top;
	            }
	            return rect;
	        } catch (e) {
	            throw new TypeError("Can't call getBoundingClientRect on " + el);
	        }
	    }
	}

	function pointInside(point, el) {
	    var rect = getClientRect(el);
	    return point.y > rect.top && point.y < rect.bottom && point.x > rect.left && point.x < rect.right;
	}

	var objectCreate = void 0;
	if (typeof Object.create != 'function') {
	  objectCreate = function (undefined$1) {
	    var Temp = function Temp() {};
	    return function (prototype, propertiesObject) {
	      if (prototype !== Object(prototype) && prototype !== null) {
	        throw TypeError('Argument must be an object, or null');
	      }
	      Temp.prototype = prototype || {};
	      var result = new Temp();
	      Temp.prototype = null;
	      if (propertiesObject !== undefined$1) {
	        Object.defineProperties(result, propertiesObject);
	      }

	      // to imitate the case of Object.create(null)
	      if (prototype === null) {
	        result.__proto__ = null;
	      }
	      return result;
	    };
	  }();
	} else {
	  objectCreate = Object.create;
	}

	var objectCreate$1 = objectCreate;

	var mouseEventProps = ['altKey', 'button', 'buttons', 'clientX', 'clientY', 'ctrlKey', 'metaKey', 'movementX', 'movementY', 'offsetX', 'offsetY', 'pageX', 'pageY', 'region', 'relatedTarget', 'screenX', 'screenY', 'shiftKey', 'which', 'x', 'y'];

	function createDispatcher(element) {

	    var defaultSettings = {
	        screenX: 0,
	        screenY: 0,
	        clientX: 0,
	        clientY: 0,
	        ctrlKey: false,
	        shiftKey: false,
	        altKey: false,
	        metaKey: false,
	        button: 0,
	        buttons: 1,
	        relatedTarget: null,
	        region: null
	    };

	    if (element !== undefined) {
	        element.addEventListener('mousemove', onMove);
	    }

	    function onMove(e) {
	        for (var i = 0; i < mouseEventProps.length; i++) {
	            defaultSettings[mouseEventProps[i]] = e[mouseEventProps[i]];
	        }
	    }

	    var dispatch = function () {
	        if (MouseEvent) {
	            return function m1(element, initMove, data) {
	                var evt = new MouseEvent('mousemove', createMoveInit(defaultSettings, initMove));

	                //evt.dispatched = 'mousemove';
	                setSpecial(evt, data);

	                return element.dispatchEvent(evt);
	            };
	        } else if (typeof document.createEvent === 'function') {
	            return function m2(element, initMove, data) {
	                var settings = createMoveInit(defaultSettings, initMove);
	                var evt = document.createEvent('MouseEvents');

	                evt.initMouseEvent("mousemove", true, //can bubble
	                true, //cancelable
	                window, //view
	                0, //detail
	                settings.screenX, //0, //screenX
	                settings.screenY, //0, //screenY
	                settings.clientX, //80, //clientX
	                settings.clientY, //20, //clientY
	                settings.ctrlKey, //false, //ctrlKey
	                settings.altKey, //false, //altKey
	                settings.shiftKey, //false, //shiftKey
	                settings.metaKey, //false, //metaKey
	                settings.button, //0, //button
	                settings.relatedTarget //null //relatedTarget
	                );

	                //evt.dispatched = 'mousemove';
	                setSpecial(evt, data);

	                return element.dispatchEvent(evt);
	            };
	        } else if (typeof document.createEventObject === 'function') {
	            return function m3(element, initMove, data) {
	                var evt = document.createEventObject();
	                var settings = createMoveInit(defaultSettings, initMove);
	                for (var name in settings) {
	                    evt[name] = settings[name];
	                }

	                //evt.dispatched = 'mousemove';
	                setSpecial(evt, data);

	                return element.dispatchEvent(evt);
	            };
	        }
	    }();

	    function destroy() {
	        if (element) { element.removeEventListener('mousemove', onMove, false); }
	        defaultSettings = null;
	    }

	    return {
	        destroy: destroy,
	        dispatch: dispatch
	    };
	}

	function createMoveInit(defaultSettings, initMove) {
	    initMove = initMove || {};
	    var settings = objectCreate$1(defaultSettings);
	    for (var i = 0; i < mouseEventProps.length; i++) {
	        if (initMove[mouseEventProps[i]] !== undefined) { settings[mouseEventProps[i]] = initMove[mouseEventProps[i]]; }
	    }

	    return settings;
	}

	function setSpecial(e, data) {
	    console.log('data ', data);
	    e.data = data || {};
	    e.dispatched = 'mousemove';
	}

	var prefix = [ 'webkit', 'moz', 'ms', 'o' ];

	var requestFrame = (function () {

	    if (typeof window === "undefined") {
	        return function () {};
	    }

	    for ( var i = 0, limit = prefix.length ; i < limit && ! window.requestAnimationFrame ; ++i ) {
	        window.requestAnimationFrame = window[ prefix[ i ] + 'RequestAnimationFrame' ];
	    }

	    if ( ! window.requestAnimationFrame ) {
	        var lastTime = 0;

	        window.requestAnimationFrame = function (callback) {
	            var now   = new Date().getTime();
	            var ttc   = Math.max( 0, 16 - now - lastTime );
	            var timer = window.setTimeout( function () { return callback( now + ttc ); }, ttc );

	            lastTime = now + ttc;

	            return timer;
	        };
	    }

	    return window.requestAnimationFrame.bind( window );
	})();

	var cancelFrame = (function () {

	    if (typeof window === "undefined") {
	        return function () {};
	    }

	    for ( var i = 0, limit = prefix.length ; i < limit && ! window.cancelAnimationFrame ; ++i ) {
	        window.cancelAnimationFrame = window[ prefix[ i ] + 'CancelAnimationFrame' ] || window[ prefix[ i ] + 'CancelRequestAnimationFrame' ];
	    }

	    if ( ! window.cancelAnimationFrame ) {
	        window.cancelAnimationFrame = function (timer) {
	            window.clearTimeout( timer );
	        };
	    }

	    return window.cancelAnimationFrame.bind( window );
	})();

	function AutoScroller(elements, options){
	    if ( options === void 0 ) { options = {}; }

	    var self = this;
	    var maxSpeed = 4, scrolling = false;

	    if (typeof options.margin !== 'object') {
	        var margin = options.margin || -1;

	        this.margin = {
	            left: margin,
	            right: margin,
	            top: margin,
	            bottom: margin
	        };
	    } else {
	        this.margin = options.margin;
	    }

	    //this.scrolling = false;
	    this.scrollWhenOutside = options.scrollWhenOutside || false;

	    var point = {},
	        pointCB = createPointCB(point),
	        dispatcher = createDispatcher(),
	        down = false;

	    window.addEventListener('mousemove', pointCB, false);
	    window.addEventListener('touchmove', pointCB, false);

	    if(!isNaN(options.maxSpeed)){
	        maxSpeed = options.maxSpeed;
	    }

	    if (typeof maxSpeed !== 'object') {
	        maxSpeed = {
	            left: maxSpeed,
	            right: maxSpeed,
	            top: maxSpeed,
	            bottom: maxSpeed
	        };
	    }

	    this.autoScroll = boolean(options.autoScroll);
	    this.syncMove = boolean(options.syncMove, false);

	    this.destroy = function(forceCleanAnimation) {
	        window.removeEventListener('mousemove', pointCB, false);
	        window.removeEventListener('touchmove', pointCB, false);
	        window.removeEventListener('mousedown', onDown, false);
	        window.removeEventListener('touchstart', onDown, false);
	        window.removeEventListener('mouseup', onUp, false);
	        window.removeEventListener('touchend', onUp, false);
	        window.removeEventListener('pointerup', onUp, false);
	        window.removeEventListener('mouseleave', onMouseOut, false);

	        window.removeEventListener('mousemove', onMove, false);
	        window.removeEventListener('touchmove', onMove, false);

	        window.removeEventListener('scroll', setScroll, true);
	        elements = [];
	        if(forceCleanAnimation){
	          cleanAnimation();
	        }
	    };

	    this.add = function(){
	        var arguments$1 = arguments;

	        var element = [], len = arguments.length;
	        while ( len-- ) { element[ len ] = arguments$1[ len ]; }

	        addElements.apply(void 0, [ elements ].concat( element ));
	        return this;
	    };

	    this.remove = function(){
	        var arguments$1 = arguments;

	        var element = [], len = arguments.length;
	        while ( len-- ) { element[ len ] = arguments$1[ len ]; }

	        return removeElements.apply(void 0, [ elements ].concat( element ));
	    };

	    var hasWindow = null, windowAnimationFrame;

	    if(Object.prototype.toString.call(elements) !== '[object Array]'){
	        elements = [elements];
	    }

	    (function(temp){
	        elements = [];
	        temp.forEach(function(element){
	            if(element === window){
	                hasWindow = window;
	            }else {
	                self.add(element);
	            }
	        });
	    }(elements));

	    Object.defineProperties(this, {
	        down: {
	            get: function(){ return down; }
	        },
	        maxSpeed: {
	            get: function(){ return maxSpeed; }
	        },
	        point: {
	            get: function(){ return point; }
	        },
	        scrolling: {
	            get: function(){ return scrolling; }
	        }
	    });

	    var current = null, animationFrame;

	    window.addEventListener('mousedown', onDown, false);
	    window.addEventListener('touchstart', onDown, false);
	    window.addEventListener('mouseup', onUp, false);
	    window.addEventListener('touchend', onUp, false);

	    /*
	    IE does not trigger mouseup event when scrolling.
	    It is a known issue that Microsoft won't fix.
	    https://connect.microsoft.com/IE/feedback/details/783058/scrollbar-trigger-mousedown-but-not-mouseup
	    IE supports pointer events instead
	    */
	    window.addEventListener('pointerup', onUp, false);

	    window.addEventListener('mousemove', onMove, false);
	    window.addEventListener('touchmove', onMove, false);

	    window.addEventListener('mouseleave', onMouseOut, false);

	    window.addEventListener('scroll', setScroll, true);

	    function setScroll(e){

	        for(var i=0; i<elements.length; i++){
	            if(elements[i] === e.target){
	                scrolling = true;
	                break;
	            }
	        }

	        if(scrolling){
	            requestFrame(function (){ return scrolling = false; });
	        }
	    }

	    function onDown(){
	        down = true;
	    }

	    function onUp(){
	        down = false;
	        cleanAnimation();
	    }
	    function cleanAnimation(){
	      cancelFrame(animationFrame);
	      cancelFrame(windowAnimationFrame);
	    }
	    function onMouseOut(){
	        down = false;
	    }

	    function getTarget(target){
	        if(!target){
	            return null;
	        }

	        if(current === target){
	            return target;
	        }

	        if(hasElement(elements, target)){
	            return target;
	        }

	        while(target = target.parentNode){
	            if(hasElement(elements, target)){
	                return target;
	            }
	        }

	        return null;
	    }

	    function getElementUnderPoint(){
	        var underPoint = null;

	        for(var i=0; i<elements.length; i++){
	            if(inside(point, elements[i])){
	                underPoint = elements[i];
	            }
	        }

	        return underPoint;
	    }


	    function onMove(event){

	        if(!self.autoScroll()) { return; }

	        if(event['dispatched']){ return; }

	        var target = event.target, body = document.body;

	        if(current && !inside(point, current)){
	            if(!self.scrollWhenOutside){
	                current = null;
	            }
	        }

	        if(target && target.parentNode === body){
	            //The special condition to improve speed.
	            target = getElementUnderPoint();
	        }else {
	            target = getTarget(target);

	            if(!target){
	                target = getElementUnderPoint();
	            }
	        }


	        if(target && target !== current){
	            current = target;
	        }

	        if(hasWindow){
	            cancelFrame(windowAnimationFrame);
	            windowAnimationFrame = requestFrame(scrollWindow);
	        }


	        if(!current){
	            return;
	        }

	        cancelFrame(animationFrame);
	        animationFrame = requestFrame(scrollTick);
	    }

	    function scrollWindow(){
	        autoScroll(hasWindow);

	        cancelFrame(windowAnimationFrame);
	        windowAnimationFrame = requestFrame(scrollWindow);
	    }

	    function scrollTick(){

	        if(!current){
	            return;
	        }

	        autoScroll(current);

	        cancelFrame(animationFrame);
	        animationFrame = requestFrame(scrollTick);

	    }


	    function autoScroll(el){
	        var rect = getClientRect(el), scrollx, scrolly;

	        if(point.x < rect.left + self.margin.left){
	            scrollx = Math.floor(
	                Math.max(-1, (point.x - rect.left) / self.margin.left - 1) * self.maxSpeed.left
	            );
	        }else if(point.x > rect.right - self.margin.right){
	            scrollx = Math.ceil(
	                Math.min(1, (point.x - rect.right) / self.margin.right + 1) * self.maxSpeed.right
	            );
	        }else {
	            scrollx = 0;
	        }

	        if(point.y < rect.top + self.margin.top){
	            scrolly = Math.floor(
	                Math.max(-1, (point.y - rect.top) / self.margin.top - 1) * self.maxSpeed.top
	            );
	        }else if(point.y > rect.bottom - self.margin.bottom){
	            scrolly = Math.ceil(
	                Math.min(1, (point.y - rect.bottom) / self.margin.bottom + 1) * self.maxSpeed.bottom
	            );
	        }else {
	            scrolly = 0;
	        }

	        if(self.syncMove()){
	            /*
	            Notes about mousemove event dispatch.
	            screen(X/Y) should need to be updated.
	            Some other properties might need to be set.
	            Keep the syncMove option default false until all inconsistencies are taken care of.
	            */
	            dispatcher.dispatch(el, {
	                pageX: point.pageX + scrollx,
	                pageY: point.pageY + scrolly,
	                clientX: point.x + scrollx,
	                clientY: point.y + scrolly
	            });
	        }

	        setTimeout(function (){

	            if(scrolly){
	                scrollY(el, scrolly);
	            }

	            if(scrollx){
	                scrollX(el, scrollx);
	            }

	        });
	    }

	    function scrollY(el, amount){
	        if(el === window){
	            window.scrollTo(el.pageXOffset, el.pageYOffset + amount);
	        }else {
	            el.scrollTop += amount;
	        }
	    }

	    function scrollX(el, amount){
	        if(el === window){
	            window.scrollTo(el.pageXOffset + amount, el.pageYOffset);
	        }else {
	            el.scrollLeft += amount;
	        }
	    }

	}

	function AutoScrollerFactory(element, options){
	    return new AutoScroller(element, options);
	}

	function inside(point, el, rect){
	    if(!rect){
	        return pointInside(point, el);
	    }else {
	        return (point.y > rect.top && point.y < rect.bottom &&
	                point.x > rect.left && point.x < rect.right);
	    }
	}

	//,
	    autoScroll = AutoScrollerFactory;


	var drake = dragula_1([document.querySelector('#list'), document.querySelector('#hlist')]);

	var scroll = autoScroll([
	        window,
	        document.querySelector('#list-container'),
	        document.querySelector('#container2')
	    ],{
	    margin: 20,
	    maxSpeed: 20,
	    syncMove: true,
	    autoScroll: function(){
	        return this.down && drake.dragging;
	    }
	});

}());
