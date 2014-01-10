
var common = module.exports = {};
var network_sid = localStorage.getItem('network_sid');
var is_first_session = network_sid === null;
if (is_first_session) network_sid = genDeviceSid();

// App Setup
// =========

// Loadtime p2p setup
common.setupRelay = function(relay) {
	common.relay = relay;
	relay.on('accessGranted', function() { relay.startListening(); });
	relay.on('notlistening', function() { common.feedUA.POST('<strong>Network Relay Connection Closed</strong>. You can no longer accept peer connections.', { Content_Type: 'text/html' }); });
	relay.on('listening', function() { common.feedUA.POST('<strong>Connected to Network Relay</strong>. You can now accept peer connections.', { Content_Type: 'text/html' }); });
	relay.on('outOfStreams', function() { common.feedUA.POST('<strong>No more connections available on your account</strong>. Close some other apps and try again.', { Content_Type: 'text/html' }); });
	// :TODO: - use the code below if device network-identity persistence matters (eg for tracking a dataset)
	/*relay.autoRetryStreamTaken = false; // :TODO (may not need): the relay created by grimwidget does this automatically
	relay.on('accessGranted', function() {
		relay.setSid(network_sid);
		relay.startListening();
	});
	relay.on('streamTaken', function() {
		// If a stream collision occurred, generate a new sid based on whether this is a new device in the network
		network_sid = (is_first_session) ? common.genDeviceSid() : common.genSessionSid(network_sid);
		relay.setSid(network_sid);
		relay.startListening();
	});
	relay.on('listening', function() {
		relay.registerLinks([
			{ href: '/', rel: 'self service mail.gwr.io', title: 'Syncmail' },
			{ href: '/folders', rel: 'collection mail.gwr.io/folders', id: 'folders', title: 'Mail Folders' }
		]);
		local.dispatch({ method: 'REFRESH', url: 'layout.app' });
		if (is_first_session) { // save the sid if this was a new device
			console.log('Detected first run on this device, assigned network identity with sid:', network_sid);
			localStorage.setItem('network_sid', network_sid);
		} else {
			console.log('Assumed existing network identity with sid:', network_sid);
		}
	});*/
};


// App Behavior
// ============

var $chrome_url = $('#chrome-url');
var $chrome_back = $('#chrome-back');
var $chrome_forward = $('#chrome-forward');
var $chrome_refresh = $('#chrome-refresh');
var chrome_history = [];
var chrome_history_position = -1;

function goBack() {
	chrome_history_position--;
	if (chrome_history_position < 0) {
		chrome_history_position = 0;
		return false;
	}
	window.location.hash = chrome_history_position;
}

function goForward() {
	chrome_history_position++;
	if (chrome_history_position >= chrome_history.length) {
		chrome_history_position = chrome_history.length - 1;
		return false;
	}
	window.location.hash = chrome_history_position;
}

function renderFromCache(pos) {
	pos = (typeof pos == 'undefined') ? chrome_history_position : pos;
	var history = chrome_history[pos];
	$chrome_url.val(history.url);
	var html = '<link href="css/bootstrap.css" rel="stylesheet"><link href="css/dashboard.css" rel="stylesheet"><link href="css/iframe.css" rel="stylesheet">'+history.html;
	var $iframe = $('main iframe');
	$iframe.contents().find('body').html(common.sanitizeHtml(html));
	// $('main').html(history.html);
}

common.setupChromeUI = function() {
	$chrome_back.on('click', function() {
		goBack();
		renderFromCache();
		return false;
	});
	$chrome_forward.on('click', function() {
		goForward();
		renderFromCache();
		return false;
	});
	$chrome_refresh.on('click', function() {
		common.dispatchRequest({ method: 'GET', url: $chrome_url.val(), target: '_content' });
		return false;
	});
	$chrome_url.on('keydown', function(e) {
		if (e.which === 13) {
			common.dispatchRequest({ method: 'GET', url: $chrome_url.val(), target: '_content' });
		}
	});
};

// Iframe Behaviors
var $iframe = $('main iframe');
local.bindRequestEvents($iframe.contents()[0].body);
$iframe.contents()[0].body.addEventListener('request', function(e) {
	common.dispatchRequest(e.detail, e.target);
});

common.dispatchRequest = function(req, origin) {
	// Relative link? Use context to make absolute
	// :TODO:

	// Content target? Update page
	if (req.target == '_content' || req.target == '_card_group' || req.target == '_card_self') {
		if ((!req.headers || !req.headers.accept) && !req.Accept) { req.Accept = 'text/html, */*'; }
		return local.dispatch(req).always(function(res) {
			/*if ([301, 302, 303, 305].indexOf(res.status) !== -1) {
				if (res.headers.location) {
					return common.dispatchRequest({ method: 'GET', url: res.headers.location, target: '_content' }, origin);
				}
				console.error('Redirect response is missing its location header');
			}*/

			// Generate final html
			var html;
			if (res.body && typeof res.body == 'string') {
				html = res.body;
				if (res.Content_Type != 'text/html') {
					html = '<pre class="plain">'+html+'</pre>';
				}
			} else {
				html = '<h1>'+(+res.status)+' <small>'+(res.reason||'').replace(/</g,'&lt;')+'</small></h1>';
				if (res.body && typeof res.body != 'string') { html += '<pre class="plain">'+JSON.stringify(res.body).replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</pre>'; }
			}

			// Update history
			$('#chrome-url').val(decodeURIComponent(req.url));
			if (chrome_history.length > (chrome_history_position+1)) {
				chrome_history.length = chrome_history_position+1;
			}
			chrome_history.push({ url: req.url, html: html });
			chrome_history_position++;
			window.location.hash = chrome_history_position;

			// Reset view
			if (res.status == 205) {
				goBack();
			}

			// Render
			renderFromCache();

			return res;
		});

		/*.fail(function(res) {
			if (res.status == 422 && e.target.tagName == 'FORM' && res.body) {
				// Bad ent - fill errors
				var $form = $(e.target);
				$('.has-error', $form).removeClass('has-error');
				for (var k in res.body) {
					$('[name='+k+']', $form).parent('.form-group').addClass('has-error');
					$('#'+k+'-error', $form).html(res.body[k]);
				}
			}
			throw res;
		});*/
	}

	// No special target? Simple dispatch
	return local.dispatch(req);
};

window.onhashchange = function() {
	var new_pos = (+window.location.hash.slice(1)) || 0;
	if (new_pos == chrome_history_position) return;
	chrome_history_position = new_pos;
	renderFromCache();
};

// P2P Utilities
// =============

common.publishNetworkLinks = function() {
	// Gather servers that are marked 'on_network'
	var servers = local.getServers();
	var domains = [];
	for (var domain in servers) {
		var server = servers[domain].context;
		if (server && server.config && server.config.on_network) {
			domains.push(domain);
		}
	}

	// Fetch self links
	var links = [];
	local.promise.bundle(domains.map(local.HEAD.bind(local))).then(function(ress) {
		common.relay.registerLinks(ress.map(function(res, i) {
			var selfLink = local.queryLinks(res, { rel: 'self' })[0];
			if (!selfLink) {
				selfLink = { rel: 'service', id: domains[i] };
			}
			selfLink.rel = (selfLink.rel) ? selfLink.rel.replace(/(^|\b)(self|up|via)(\b|$)/gi, '') : 'service';
			selfLink.href = '/'+domains[i]; // Overwrite href
			return selfLink;
		}));
	});
};


// Database Utilities
// ==================

// Adds a message to the given db, guarantees a unique ID
common.addMessage = function(db, doc) {
	var p = local.promise();
	doc._id = doc.from + '.' + Date.now() + '.' + Math.round(Math.random()*10000);
	db.put(doc, function(err, res) {
		if (err && err.status == 409) { common.addMessage(db, doc).chain(p); }
		else if (err) p.reject(err);
		else p.fulfill(res);
	});
	return p;
};

// Gets, updates, and puts a doc
common.updateDoc = function(db, id, updates) {
	var p = local.promise();
	db.get(id, function(err, doc) {
		if (err) { return p.reject([500, err]); }

		for (var k in updates) {
			doc[k] = updates[k];
		}

		db.put(doc, function(err) {
			if (err) { return p.reject([500, err]); }
			p.fulfill(204);
		});
	});
	return p;
};

// App Utilities
// =============

/*var relay = grimwidget.getRelay();
common.getSessionUser = relay.getUserId.bind(relay);
common.getSessionRelay = function() {
	var providerd = local.parseUri(relay.getProvider() || '');
	if (providerd) return providerd.authority;
	return '';
};
common.getSessionEmail = function() { return common.getSessionUser() + '@' + common.getSessionRelay(); };
common.isPeerSessionUser = function(peer) {
	return (peer.getPeerInfo().user == common.getSessionUser() && peer.getPeerInfo().relay == common.getSessionRelay());
};*/
function genDeviceSid() { return Math.round(Math.random()*10000)*100; }; // [0,1000000) with a step of 100
common.genDeviceSid = genDeviceSid;
common.genSessionSid = function(deviceSid) { return deviceSid+Math.round(Math.random()*99)+1; }; // [deviceSid+1, deviceSid+100)
common.genDeviceName = function() {
	if (navigator.userAgent.indexOf('Opera') !== -1) return 'Opera';
	else if (navigator.userAgent.indexOf('MSIE') !== -1) return 'IE';
	else if (navigator.userAgent.indexOf('Chrome') !== -1) return 'Chrome';
	else if (navigator.userAgent.indexOf('Safari') !== -1) return 'Safari';
	else if (navigator.userAgent.indexOf('Firefox') !== -1) return 'Firefox';
	// :TODO: mobile
	return 'device';
};
var ltregexp = /</g;
var gtregexp = />/g;
common.escape = function(str) {
	return (''+str).replace(ltregexp, '&lt;').replace(gtregexp, '&gt;');
};
var sanitizeHtmlRegexp = /<\s*script/g;
common.sanitizeHtml = function(html) {
	// :TODO: this is probably naive in some important way that I'm too naive to diagnose
	// CSP stops inline or remote script execution, but we still want to stop inclusions of scripts on our domain
	return html.replace(sanitizeHtmlRegexp, '&lt;script');
};
common.normalizeRel = function(rel) {
	var reld = local.parseUri(rel);
	if (!reld.path) reld.relative = '/'+reld.relative; // Always have a trailing slash on the hostname
	else if (reld.path != '/' && reld.path.slice(-1) == '/') reld.relative = reld.relative.replace(reld.path, reld.path.slice(0,-1)); // Never have a trailing slash on the path
	return reld.authority + reld.relative;
};
common.normalizeUri = function(uri) {
	var urid = local.parseUri(uri);
	if (!urid.path) urid.relative = '/'+urid.relative; // Always have a trailing slash on the hostname
	else if (urid.path != '/' && urid.path.slice(-1) == '/') urid.relative = urid.relative.replace(urid.path, urid.path.slice(0,-1)); // Never have a trailing slash on the path
	return (urid.protocol||'httpl') + '://' + urid.authority + urid.relative;
};

var sources = null;
common.getSources = function(forceReload) {
	if (!sources || forceReload) {
		try { sources = JSON.parse(localStorage.getItem('sources')); }
		catch (e) { return []; }
	}
	return sources || [];
};
common.setSources = function(s, noSave) {
	sources = s;
	if (!noSave) {
		localStorage.setItem('sources', JSON.stringify(sources));
	}
};

var relayUsers = null;
common.getRelayUsers = function() {
	if (relayUsers) {
		return local.promise(relayUsers);
	}
	return relay.getUsers().then(
		function(res) { relayUsers = res.body.rows; return relayUsers; },
		function(res) { console.error('Failed to fetch relay users', res); return null; }
	);
};
common.ucfirst = function(str) { return str.charAt(0).toUpperCase() + str.slice(1); };