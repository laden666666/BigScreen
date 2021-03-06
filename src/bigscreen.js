// A library to make it easier to use the JavaScript Fullscreen API.
(function(root, document, iframe) {
	'use strict';
         
	// 判断ios7
	var iOS7 = /i(Pad|Phone|Pod)/.test(navigator.userAgent) && parseInt(navigator.userAgent.replace(/^.*OS (\d+)_(\d+).*$/, '$1.$2'), 10) >= 7;

	//通过创建一个video元素，测试操作系统支持的requestFullscreen函数版本，并返回统一的去除前缀的函数名
	//fn是一个对象
	var fn = (function() {
		var testElement = document.createElement('video');
		var browserProperties = {
			request: ['requestFullscreen', 'webkitRequestFullscreen', 'webkitRequestFullScreen', 'mozRequestFullScreen', 'msRequestFullscreen'],
			exit: ['exitFullscreen', 'webkitCancelFullScreen', 'webkitExitFullscreen', 'mozCancelFullScreen', 'msExitFullscreen'],
			enabled: ['fullscreenEnabled', 'webkitFullscreenEnabled', 'mozFullScreenEnabled', 'msFullscreenEnabled'],
			element: ['fullscreenElement', 'webkitFullscreenElement', 'webkitCurrentFullScreenElement', 'mozFullScreenElement', 'msFullscreenElement'],
			change: ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'],
			error: ['fullscreenerror', 'webkitfullscreenerror', 'mozfullscreenerror', 'MSFullscreenError']
		};

		var properties = {};

		// Loop thorugh each property/event/function and find the ones that work
		// in this browser.
		for (var prop in browserProperties) {
			for (var i = 0, length = browserProperties[prop].length; i < length; i++) {
				if (browserProperties[prop][i] in testElement || browserProperties[prop][i] in document || 'on' + browserProperties[prop][i].toLowerCase() in document) {
					properties[prop] = browserProperties[prop][i];
					break;
				}
			}
		}

		return properties;
	}());

	// Find a child video in the element passed.
	// 获取元素的video节点
	function _getVideo(element) {
		var videoElement = null;

		if (element.tagName === 'VIDEO') {
			videoElement = element;
		}
		else {
			var videos = element.getElementsByTagName('video');
			if (videos[0]) {
				videoElement = videos[0];
			}
		}

		return videoElement;
	}

	// 查找的视频元素
	var lastVideoElement = null;
	// 视频元素是否有controls
	var hasControls = null;
	var emptyFunction = function() {};
	var elements = [];
	// 是否是安卓的chrome
	var chromeAndroid = false;

	// 获取安卓的chrome的版本。如果不是安卓或者chrome，则是false
	if (navigator.userAgent.indexOf('Android') > -1 && navigator.userAgent.indexOf('Chrome') > -1) {
		chromeAndroid = parseInt(navigator.userAgent.replace(/^.*Chrome\/(\d+).*$/, '$1'), 10) || true;
	}

	// Attempt to put a child video into full screen using webkitEnterFullscreen.
	// The metadata must be loaded in order for it to work, so load it automatically
	// if it isn't already.
	// 全屏播放视频
	function videoEnterFullscreen(element) {
		// 获取video节点
		var videoElement = _getVideo(element);

		// ************************重要
		// 在一些webkit内核的浏览器中（如safari），视频进入全屏和退出全屏是一套新api（webkitEnterFullscreen），而不是webkitRequestFullscreen
	        // 而且必须在视频的媒体信息加载完成后才能工作
		if (videoElement && videoElement.webkitEnterFullscreen) {
			try {
				// 
				if (videoElement.readyState < videoElement.HAVE_METADATA) {
					videoElement.addEventListener('loadedmetadata', function onMetadataLoaded() {
						videoElement.removeEventListener('loadedmetadata', onMetadataLoaded, false);
						videoElement.webkitEnterFullscreen();
						hasControls = !!videoElement.getAttribute('controls');
					}, false);
					videoElement.load();
				}
				else {
					videoElement.webkitEnterFullscreen();
					
					// 是否有control
					hasControls = !!videoElement.getAttribute('controls');
				}

				lastVideoElement = videoElement;
			}
			catch (err) {
				return callOnError('not_supported', element);
			}

			return true;
		}

		return callOnError(fn.request === undefined ? 'not_supported' : 'not_enabled', element);
	}

	// There is a bug in older versions of WebKit that will fire `webkitfullscreenchange` twice when
	// entering full screen from inside an iframe, and won't fire it when exiting. We can listen for
	// a resize event once we enter to tell when it returns to normal size (and thus has exited full
	// screen). See the [Safari bug](rdar://11927884).
	//修复resize的bug，该bug是从iframe里面进入全屏，webkitfullscreenchange不触发，所以使用resize代替webkitfullscreenchange
	function resizeExitHack() {
		if (!bigscreen.element) {
			callOnExit();
			removeWindowResizeHack();
		}
	}

	// Add the listener for the resize hack, but only when inside an iframe in WebKit.
	function addWindowResizeHack() {
		// 如果是webkit内核，在浏览器reszie会有bug，所以加一个hack。因为bug仅在iframe发生，所以仅在iframe存在时候加补丁
		if (iframe && fn.change === 'webkitfullscreenchange') {
			window.addEventListener('resize', resizeExitHack, false);
		}
	}

	//退出全屏时候，移除对补丁的监听
	function removeWindowResizeHack() {
		if (iframe && fn.change === 'webkitfullscreenchange') {
			window.removeEventListener('resize', resizeExitHack, false);
		}
	}

	//进入全屏的回调
	var callOnEnter = function(actualElement) {
		// Return if the element entering has actually entered already. In older WebKit versions the
		// browser will fire 2 `webkitfullscreenchange` events when entering full screen from inside an
		// iframe. This is the result of the same bug as the resizeExitHack.
		var lastElement = elements[elements.length - 1];

		if (!lastElement) {
			return;
		}

		if ((actualElement === lastElement.element || actualElement === lastVideoElement) && lastElement.hasEntered) {
			return;
		}

		// If the element is a video, store it here for the enabled check.
		if (actualElement.tagName === 'VIDEO') {
			lastVideoElement = actualElement;
		}

		// Call the global enter handler only if this is the first element.
		if (elements.length === 1) {
			bigscreen.onenter(bigscreen.element);
		}

		// Call the stored callback for the request call and record that we did so we don't do it
		// again if there is a duplicate call (see above).
		lastElement.enter.call(lastElement.element, actualElement || lastElement.element);
		lastElement.hasEntered = true;
	};

	//退出全屏时候调用
	var callOnExit = function() {
		// Fix a bug present in some versions of WebKit that will show the native controls when
		// exiting, even if they were not showing before. In iOS 7, this actually causes the
		// native controls to show up, although once they hide they stay hidden.
		if (lastVideoElement && !hasControls && !iOS7) {
			lastVideoElement.setAttribute('controls', 'controls');
			lastVideoElement.removeAttribute('controls');
		}

		lastVideoElement = null;
		hasControls = null;

		var element = elements.pop();

		// Check to make sure that the element exists. This function will get called a second
		// time from the iframe resize hack.
		if (element) {
			element.exit.call(element.element);

			// When the browser has fully exited full screen, make sure to loop
			// through and call the rest of the callbacks and then the global exit.
			if (!bigscreen.element) {
				elements.forEach(function(el) {
					el.exit.call(el.element);
				});
				elements = [];

				bigscreen.onexit();
			}
		}
	};

	// Make a callback to the error handlers and clear the element from the stack when
	// an error occurs.
	// 错误时候调用
	var callOnError = function(reason, element) {
		if (elements.length > 0) {
			var obj = elements.pop();
			element = element || obj.element;

			obj.error.call(element, reason);
			bigscreen.onerror(element, reason);
		}
	};

	// 定义bigscreen模块
	var bigscreen = {
		// ### request
		// The meat of BigScreen is here. Run through a bunch of checks to try to get
		// something into full screen that's a child of the element passed in.
		request: function(element, enterCallback, exitCallback, errorCallback) {
			element = element || document.body;

			//将用于请求的element放入elements里面，具体意义不清楚，是为了做全屏后再全屏？？？？？？？？？？？？
			elements.push({
				element: element,
				enter: enterCallback || emptyFunction,
				exit: exitCallback || emptyFunction,
				error: errorCallback || emptyFunction
			});

			// iOS only supports webkitEnterFullscreen on videos, so try that.
			// Browsers that don't support full screen at all will also go through this,
			// but they will fire an error.
			//如果浏览器不支持视频全屏，则尝试使用视频全屏进行全屏
			if (fn.request === undefined) {
				videoEnterFullscreen(element);
				return;
			}

			//同上
			// `document.fullscreenEnabled` defined, but is `false`, so try a video if there is one.
			if (iframe && document[fn.enabled] === false) {
				videoEnterFullscreen(element);
				return;
			}

			//安卓chrome在32版本全，仅支持视频全屏
			// Chrome on Android reports that fullscreen is enabled, but it isn't really on < 32.
			if (chromeAndroid !== false && chromeAndroid < 32) {
				videoEnterFullscreen(element);
				return;
			}

			// If we're in an iframe, it needs to have the `allowfullscreen` attribute in order for element full screen
			// to work. Safari 5.1 supports element full screen, but doesn't have `document.webkitFullScreenEnabled`,
			// so the only way to tell if it will work is to just try it.
			//如果在safari的iframe里面，需要iframe设置allowfullscreen才支持全屏
			//但是safari5.1是支持全屏的，不过在iframe里面却没有webkitFullscreenEnabled，所以需要特殊对应一下。所以只能尝试先全屏，如果失败再尝试视频全屏。
			if (iframe && fn.enabled === undefined) {
				fn.enabled = 'webkitFullscreenEnabled';

				element[fn.request]();

				setTimeout(function() {
					// It didn't work, so set `webkitFullscreenEnabled` to false so we don't
					// have to try again next time. Then try to fall back to video full screen.
					//如果全屏不工作，再尝试一下视频全屏
					if (!document[fn.element]) {
						document[fn.enabled] = false;
						videoEnterFullscreen(element);
					}
					// It worked! set `webkitFullscreenEnabled` so we know next time.
					else {
						document[fn.enabled] = true;
					}
				}, 250);

				return;
			}

			try {
				//开始全屏
				element[fn.request]();

				// If there's no element after 100ms, it didn't work. This check is for Safari 5.1
				// which fails to fire a `webkitfullscreenerror` if the request wasn't from a user
				// action.
				setTimeout(function() {
					//如果element为空，说明全屏失败（为抛出异常）。则在回调错误
					if (!document[fn.element]) {
						callOnError(iframe ? 'not_enabled' : 'not_allowed', element);
					}
				}, 100);
			}
			catch (err) {
				//全屏失败的回调
				callOnError('not_enabled', element);
			}
		},
		// ### exit
		// Pops the last full screen element off the stack.
		exit: function() {
			// Remove the resize hack here if exit is called manually, so it doesn't fire twice.
			removeWindowResizeHack();
			document[fn.exit]();
		},
		// ### toggle
		// Shortcut function if you only plan on putting one element into full screen.
		toggle: function(element, enterCallback, exitCallback, errorCallback) {
			if (bigscreen.element) {
				bigscreen.exit();
			}
			else {
				bigscreen.request(element, enterCallback, exitCallback, errorCallback);
			}
		},

		// ### videoEnabled
		// Mobile Safari and earlier versions of desktop Safari support sending a `<video>` into full screen,
		// even if the `allowfullscreen` attribute isn't present on the iframe. Checks can't be performed to
		// verify full screen capabilities unless we know about that element, and it has loaded its metadata.
		videoEnabled: function(element) {
			if (bigscreen.enabled) {
				return true;
			}

			element = element || document.body;
			var video = _getVideo(element);

			//webkitSupportsFullscreen这个函数？？？？？？？？？
			if (!video || video.webkitSupportsFullscreen === undefined) {
				return false;
			}

			return video.readyState < video.HAVE_METADATA ? 'maybe' : video.webkitSupportsFullscreen;
		},

		// ### onenter, onexit, onchange, onerror
		// Populate the global handlers with empty functions.
		onenter: emptyFunction,
		onexit: emptyFunction,
		onchange: emptyFunction,
		onerror: emptyFunction
	};

	// Define the two properties `element` and `enabled` with getters.
	try {
		Object.defineProperties(bigscreen, {
			// ### element
			// Get the current element that is displaying full screen.
			element: {
				enumerable: true,
				get: function() {
					//如果视频全屏显示了，返回视频节点
					if (lastVideoElement && lastVideoElement.webkitDisplayingFullscreen) {
						return lastVideoElement;
					}
					
					// ????
					return document[fn.element] || null;
				}
			},
			// ### enabled
			// Check if element full screen is supported.
			//判断是否支持全屏
			enabled: {
				enumerable: true,
				get: function() {
					// Safari 5.1 supports full screen, but doesn't have a fullScreenEnabled property,
					// but it should work if not in an iframe. If it doesn't work when tried for the
					// first time, we'll set this to `false` then.
					//ios不支持fullScreenEnabled，但是仍然支持全屏显示。所以如果有webkitCancelFullScreen认为是支持全屏
					//但是ios的iframe中不支持全屏
					if (fn.exit === 'webkitCancelFullScreen' && !iframe) {
						return true;
					}

					// Chrome on Android reports that fullscreen is enabled, but it isn't really.
					//安卓上chrome版本在32以前的版本自称支持全屏，但是实际上是不支持的，所以返回false
					if (chromeAndroid !== false && chromeAndroid < 32) {
						return false;
					}

					//排除特殊版本后，使用enabled判断
					return document[fn.enabled] || false;
				}
			}
		});

		// If there is a valid `fullscreenchange` event, set up the listener for it.
		//增添fullscreenchange处理
		if (fn.change) {
			document.addEventListener(fn.change, function onFullscreenChange(event) {
				bigscreen.onchange(bigscreen.element);

				if (bigscreen.element) {
					// This should be treated an exit if the element that is in full screen
					// is the previous element in our stack.
					var previousElement = elements[elements.length - 2];
					if (previousElement && previousElement.element === bigscreen.element) {
						callOnExit();
					}
					else {
						callOnEnter(bigscreen.element);
						addWindowResizeHack();
					}
				}
				else {
					callOnExit();
				}
			}, false);
		}

		// Listen for the video-only fullscreen events. Only applies to mobile browsers.
		// Desktop Safari and Chrome will fire the normal `fullscreenchange` event instead.
		// Use the capture phase because that seems to be the only way to get them.
		// video的全屏事件和其他的不同，是webkitbeginfullscreen和webkitendfullscreen，而不是change事件。但是bigscreen对此仍有bug，如果有精力我会尝试修复
		document.addEventListener('webkitbeginfullscreen', function onBeginFullscreen(event) {
			var shouldPushElement = true;

			// When BigScreen.request is called specifically, the element requested
			// is already pushed onto the stack. If the video element belongs to an
			// element on the stack, don't push it on here.
			if (elements.length > 0) {
				for (var i = 0, length = elements.length; i < length; i++) {
					var video = _getVideo(elements[i].element);
					if (video === event.srcElement) {
						shouldPushElement = false;
						break;
					}
				}
			}

			if (shouldPushElement) {
				elements.push({
					element: event.srcElement,
					enter: emptyFunction,
					exit: emptyFunction,
					error: emptyFunction
				});
			}

			bigscreen.onchange(event.srcElement);
			callOnEnter(event.srcElement);
		}, true);

		document.addEventListener('webkitendfullscreen', function onEndFullscreen(event) {
			bigscreen.onchange(event.srcElement);
			callOnExit(event.srcElement);
		}, true);

		// If there is a valid `fullscreenerror` event, set up the listener for it.
		if (fn.error) {
			document.addEventListener(fn.error, function onFullscreenError(event) {
				callOnError('not_allowed');
			}, false);
		}
	}
	// If the define fails, set them to `null` and `false`, respectively.
	catch (err) {
		bigscreen.element = null;
		bigscreen.enabled = false;
	}

	/* eslint-disable no-undef */
	//amd模块
	if (typeof define === 'function' && define.amd) {
		define(function() {
			return bigscreen;
		});
	}
	//commonjs模块
	else if (typeof module !== 'undefined' && module.exports) {
		module.exports = bigscreen;
	}
	//直接在root（window）中创建
	else {
		root.BigScreen = bigscreen;
	}
	/* eslint-enable no-undef */
//root模块，如果是浏览器环境下就是window。 通过self!=top判断是否是
}(this, document, self !== top));
