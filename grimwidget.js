/**
 * GrimWidget.js
 * =============
 * Desc: A helpful dropdown widget for connecting an application to a Grimwire
 *   relay.
 * Author: Paul Frazee <pfrazee@gmail.com>
 * Project: grimwire.com
 * Repository: github.com/grimwire/grimwire
 *
 * The MIT License (MIT) Copyright (c) 2013 Paul Frazee
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */


// Create global
var grimwidget = {};

(function() {

	// Add styles
	// ==========
	var styleEl = document.createElement('style');
	styleEl.setAttribute('type', 'text/css');
	styleEl.innerHTML = [
		'.grimwidget-popup { position: absolute; z-index: 10000; width: 300px; background: #fff; border: 1px solid #ccc; box-shadow: 0 6px 12px rgba(0, 0, 0, 0.175); }',
		'.grimwidget-popup > div { border: 1px solid #fff; }',
		'.grimwidget-popup .grimwidget-header { background: #eee; padding: 0.2em 0.4em; font-size: 10px; }',
		'.grimwidget-popup .grimwidget-header .grimwidget-controls { float: right; }',
		'.grimwidget-popup .grimwidget-body { padding: 0.5em 1em; }',
		'.grimwidget-popup .grimwidget-body hr { margin-top: 10px; margin-bottom: 10px; border: 0; border-top: 1px solid #eeeeee; }',
		'.grimwidget-popup .grimwidget-body p { margin: 0 0 6px; }',
		'.grimwidget-providerinput { width: 270px; padding: 2px 4px 4px; border: 1px solid #aaa }',
		'.grimwidget-hostuserinput { width: 170px; padding: 2px 4px 4px; border: 1px solid #aaa }',
		'.grimwidget-btn { display: inline-block; width: 270px; padding: 4px; margin-bottom: 0; font-size: 14px; font-weight: normal; white-space: nowrap; vertical-align: middle; }',
		'.grimwidget-btn { cursor: pointer; border: 1px solid #ccc; border-radius: 4px; background: #fff; color: #333; }',
		'.grimwidget-btn { -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; -o-user-select: none; user-select: none; }',
		'.grimwidget-btn:hover { background-color: #ebebeb; border-color: #adadad; }',
		'.grimwidget-btn.grimwidget-guestofbtn { width: 90px; margin-right: 8px }',
		'.grimwidget-btn.grimwidget-guestofbtn:disabled { background-color: #ebebeb; border-color: #ebebeb; }',
		'.grimwidget-label { background: #eee; border-radius: 5px; padding: 1px 5px 3px; font-size: 10px; }',
		'.grimwidget-link { overflow: auto; }',
		'.grimwidget-error { border-color: rgb(219, 3, 3) }'
	].join('\r\n');
	document.head.appendChild(styleEl);

	// Setup
	// =====
	var relay = new local.Relay();

	// Try to load provider and access token from local storage
	if (localStorage.getItem('provider')) {
		relay.setProvider(localStorage.getItem('provider'));
	}
	if (localStorage.getItem('access-token')) {
		relay.setAccessToken(localStorage.getItem('access-token'));
	}

	// Peer Relay Events
	// =================
	relay.on('accessGranted', function() {
		// Access granted, remember the token
		localStorage.setItem('access-token', relay.getAccessToken());
		localStorage.setItem('provider', relay.getProvider());
	});

	// Exported Functions
	// ==================

	// EXPORTED
	grimwidget.getRelay = function() {
		return relay;
	};

	// EXPORTED
	// Creates a peers widget
	grimwidget.create = function(config) {
		return new GrimWidget(config);
	};

	// INTERNAL
	// A popup for managing access and rendering links to a Grimwire relay
	// - `config.triggerEl`: required object, the DOM element which opens the widget on click
	// - `config.render`: optional function, called with (el, links) to render the widget when opened (once connected to the relay index)
	//   - can return a falsey value to not render the link
	// - `config.halign`: optional string, 'right' or 'left', defaults to 'left'
	// - `config.width`: optional number, the width of the popup in pixels (default 300)
	// - `config.provider`: optional string, the default relay
	// - `config.hostUser`: optional string, the default host user
	// - `config.defaultOpen`: optional bool, open on load if true
	function GrimWidget(config) {
		// Validate
		if (!config.triggerEl) {
			throw new Error("`config.triggerEl` is required");
		}

		// Config
		this.config = config;
		this.triggerEl = config.triggerEl;

		// Wire up to relay
		relay.on(['accessGranted', 'accessDenied', 'accessRemoved', 'accessInvalid', 'listening', 'notlistening'], this.setPopupContent.bind(this));

		// Prepare UI
		this.popupEl = null;
		this.triggerEl.addEventListener('click', this.onTriggerElClick.bind(this));
		document.body.addEventListener('click', this.onDocBodyClick.bind(this));
		document.body.addEventListener('touchend', this.onDocBodyClick.bind(this));
		this.triggerEl.style.background     = 'no-repeat right 15px url(data:image/png;base64,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)';
		this.triggerEl.style.backgroundSize = '30px';
		this.triggerEl.style.paddingRight   = '30px';

		// Default open
		if (config.defaultOpen) {
			this.open();
		}
	}

	// Open the popup
	GrimWidget.prototype.open = function() {
		// Don't create duplicates
		if (this.popupEl) {
			this.refresh();
			return;
		}

		// Create elmeent
		this.popupEl = document.createElement('div');
		this.popupEl.className = 'grimwidget-popup';

		// Position/size by config
		if (this.config.halign == 'right') {
			this.popupEl.style.right = '0px';
		} else {
			this.popupEl.style.left = '0px';
		}

		// Stop click/tap events from passing up to the document, so we dont close on every click within us
		local.bindRequestEvents(this.popupEl, { forms: false });
		this.popupEl.addEventListener('click', stopEvent);
		this.popupEl.addEventListener('touchend', stopEvent);

		// Add popup content
		this.setPopupContent();

		// Add the popup
		this.triggerEl.parentNode.appendChild(this.popupEl);
	};
	function dispatchRequestEvent(e) { local.dispatch(e.detail); }
	function markEvent(e) { e.hitPopup = true; }
	function stopEvent(e) { e.stopPropagation(); }

	// Close the popup
	GrimWidget.prototype.close = function() {
		// Sanity check
		if (!this.popupEl) {
			return;
		}

		// Remove from the DOM
		this.popupEl.parentNode.removeChild(this.popupEl);
		this.popupEl = null;
	};

	// Handle login process
	GrimWidget.prototype.doLogin = function(hostUser) {
		// Pull provider from UI
		var urlEl = this.popupEl.querySelector('.grimwidget-providerinput');
		urlEl.classList.remove('grimwidget-error');
		if (!urlEl.value) {
			urlEl.classList.add('grimwidget-error');
			return;
		}
		var urld = local.parseUri(urlEl.value);
		var url = ((urld.protocol) ? (urld.protocol+'://') : '//') + urld.authority;
		relay.setProvider(url);

		// Initiate auth flow (will create a popup)
		relay.requestAccessToken({ guestof: hostUser });
	};


	// UI Event Handlers
	// =================

	// Open popup click
	GrimWidget.prototype.onTriggerElClick = function(e) {
		this.open();
		e.preventDefault();
		e.stopPropagation();
	};

	// Close popup click (click elsewhere than the popup)
	GrimWidget.prototype.onDocBodyClick = function(e) {
		this.close();
	};

	// Login click
	GrimWidget.prototype.onLoginBtnClick = function() {
		this.doLogin();
	};

	// Logout click
	GrimWidget.prototype.onLogoutBtnClick = function() {
		// Update relay state
		relay.stopListening();
		relay.setAccessToken(null);
	};

	// Guestof click
	GrimWidget.prototype.onGuestofBtnClick = function() {
		var hostuserEl = this.popupEl.querySelector('.grimwidget-hostuserinput');
		this.doLogin(hostuserEl.value);
	};

	// Provider URI input
	GrimWidget.prototype.onProviderInputKeypress = function(e) {
		// If enter is pressed, treat as login click
		if (e.keyCode == 13) {
			this.onLoginBtnClick();
		}
	};

	// Guest host user input
	GrimWidget.prototype.onHostuserInputKeypress = function(e) {
		if (e.keyCode == 13) {
			this.onGuestofBtnClick();
		}
	};

	// Guest host user input
	GrimWidget.prototype.onHostuserInputInput = function(e) {
		if (e.target.value.length > 0) {
			this.popupEl.querySelector('.grimwidget-guestofbtn').removeAttribute("disabled");
		} else {
			this.popupEl.querySelector('.grimwidget-guestofbtn').setAttribute("disabled", "disabled");
		}
	};

	// UI Rendering
	// ============

	// Fetches the user's links and updates the UI with them
	GrimWidget.prototype.refresh = function() {
		if (!this.popupEl) return;
		var listEl = this.popupEl.querySelector('.grimwidget-index');
		if (!listEl) return;
		listEl.innerHTML = 'Fetching index...';

		// Fetch links
		var self = this;
		relay.agent().head()
			.then(function(res) {
				var fn = self.config.render || defaultLinkRenderer;
				fn(listEl, res.parsedHeaders.link);
			}).fail(function(res) {
				listEl.innerHTML = '<p>Could not fetch network data from <a href="'+relay.getProvider()+'" target="_blank">'+relay.getProvider()+'</a>.</p>';
			});
	};
	function defaultLinkRenderer(listEl, links) {
		listEl.innerHTML = links
			.filter(function(link) {
				// Skip the dashboard's links
				return !!link.host_app;
			})
			.map(function(link) {
				// Render
				var title = link.title || link.href;
				return [
					'<div class="grimwidget-link">',
						title+'<br/>',
						'<small>Host: '+link.host_user+', App: <a href="//'+link.host_app+'" title="'+link.host_app+'" target="_blank">'+link.host_app+'</a></small><br/>',
						(link.host_domain == relay.getRelayDomain()) ? '<span class="grimwidget-label">this app</span>' : '',
					'</div>'
				].join('');
			})
			.join('<hr/>');
	}

	// Sets the popup UI according to the connectivity state
	GrimWidget.prototype.setPopupContent = function() {
		// Update trigger button
		var triggerText = 'offline';
		if (relay.isListening()) {
			triggerText = relay.getUserId()+' online';
		}
		else if (relay.getAccessToken()) {
			triggerText = relay.getUserId()+' offline';
		}
		this.triggerEl.innerText = this.triggerEl.textContent = triggerText;

		// Update popup
		if (this.popupEl) {
			this.popupEl.innerHTML = this.renderContent();
			if (this.config.width) {
				this.popupEl.style.width = (relay.isListening()) ? this.config.width+'px' : null;
			}
			this.refresh();
			this.bindContentEvents();
		}
	};

	// Gives a DOM element according to the connectivity state
	GrimWidget.prototype.renderContent = function() {
		var provider = relay.getProvider() || this.config.provider || '';
		var hostUser = this.config.hostUser || '';
		if (relay.isListening()) {
			return [
				'<div class="grimwidget-header">',
					'Online: '+provider,
					'<span class="grimwidget-controls"><a href="http://grimwire.com" target="_blank">?</a></span>',
				'</div>',
				'<div class="grimwidget-body">',
					'<div class="grimwidget-index"></div>',
					'<hr/>',
					'<p><input class="grimwidget-btn grimwidget-logoutbtn" type="button" value="Logout"',
					((this.config.width) ? 'style="width: '+(this.config.width-30)+'px"' : ''),
					' /></p>',
				'</div>'
			].join('');
		}
		return [
			'<div class="grimwidget-header">',
				'Offline',
				'<span class="grimwidget-controls"><a href="http://grimwire.com" target="_blank">?</a></span>',
			'</div>',
			'<div class="grimwidget-body">',
				'<p>Connect to your network:</p>',
				'<p><input class="grimwidget-providerinput" type="text" value="'+provider+'" placeholder="eg grimwire.net" /></p>',
				'<p><button class="grimwidget-btn grimwidget-loginbtn">Login</button></p>',
				'<hr>',
				'<p><small>No account? Connect as a guest:</small></p>',
				'<p>',
					'<button class="grimwidget-btn grimwidget-guestofbtn" ',((!hostUser)?'disabled="disabled"':''),'>Guest of</button>',
					'<input class="grimwidget-hostuserinput" type="text" value="'+hostUser+'" placeholder="eg bob" />',
				'</p>',
			'</div>'
		].join('');
	};

	// Binds event handlers after rendering the popup
	GrimWidget.prototype.bindContentEvents = function() {
		var self = this;
		var setEvent = function(sel, event, fn) {
			var el = self.popupEl.querySelector(sel);
			if (el) { el.addEventListener(event, fn.bind(self)); }
		};
		setEvent('.grimwidget-loginbtn', 'click', this.onLoginBtnClick);
		setEvent('.grimwidget-logoutbtn', 'click', this.onLogoutBtnClick);
		setEvent('.grimwidget-guestofbtn', 'click', this.onGuestofBtnClick);
		setEvent('.grimwidget-providerinput', 'keypress', this.onProviderInputKeypress);
		setEvent('.grimwidget-hostuserinput', 'keypress', this.onHostuserInputKeypress);
		setEvent('.grimwidget-hostuserinput', 'input', this.onHostuserInputInput);
	};
})();