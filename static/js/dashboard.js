;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

var common = module.exports = {};
var network_sid = localStorage.getItem('network_sid');
var is_first_session = network_sid === null;
if (is_first_session) network_sid = genDeviceSid();

// Network Setup
// =============

// Add via header parsing
/*var viaregex = /([\d\.]+) ([A-z:\d]*)(?: \((.+)\))?/g;
local.httpHeaders.register('via',
	function (obj) {
		return obj.map(function(via) {
			var str = via.version+' '+via.hostname;
			if (via.desc) {
				str += ' ('+via.desc+')';
			}
			return str;
		}).join(', ');
	},
	function (str) {
		var vias = [], match;
		while ((match = viaregex.exec(str))) {
			var via = { version: match[1], hostname: match[2] };
			if (match[3]) via.desc = match[3];
			vias.push(via);
		}
		return vias;
	}
);*/

// Loadtime p2p setup
common.setupRelay = function(relay) {
	common.relay = relay;
	relay.on('accessGranted', function() { relay.startListening(); });
	relay.on('notlistening', function() { common.feedUA.POST('<strong>Network Relay Connection Closed</strong>. You can no longer accept peer connections.', { Content_Type: 'text/html' }); });
	relay.on('listening', function() { common.feedUA.POST('<strong>Connected to Network Relay</strong>. You can now accept peer connections.', { Content_Type: 'text/html' }); });
	relay.on('outOfStreams', function() { common.feedUA.POST('<strong>No more connections available on your account</strong>. Close some other apps and try again.', { Content_Type: 'text/html' }); });
	relay.setServer(function(req, res, peer) {
		// Build link header
		var links = [{ href: '/', rel: 'service', title: relay.getUserId() }];
		if (relay.registeredLinks) {
			links = links.concat(relay.registeredLinks);
		}
		res.setHeader('link', links);

		// Home resource
		if (req.path == '/') {
			res.headers.link[0].rel += ' self';
			return res.writeHead(204, 'OK, No Content').end();
		}
		res.headers.link[0].rel += ' via';

		// Parse path
		var path_parts = req.path.split('/');
		var hostname = path_parts[1];
		var url = 'httpl://'+hostname+'/'+path_parts.slice(2).join('/');

		// Only allow for published servers
		var server = local.getServer(hostname);
		if (!server) return res.writeHead(404, 'Not Found').end();
		if (!server.context || !server.context.config || !server.context.config.on_network)
			return res.writeHead(404, 'Not Found').end();

		// Pass the request through
		var req2 = new local.Request({
			method: req.method,
			url: url,
			query: local.util.deepClone(req.query),
			headers: local.util.deepClone(req.headers),
			stream: true
		});
		req2.headers['From'] = peer.config.domain;
		req2.headers['X-Public-Host'] = req.host;
		var res2_ = local.dispatch(req2);
		res2_.always(function(res2) {
			// Update links
			if (res2.headers.link) {
				var links = local.httpHeaders.deserialize('link', res2.headers.link);
				links.forEach(function(link) {
					if (!local.isAbsUri(link.href)) {
						link.href = local.joinUri(hostname, link.href);
					}
					link.href = '/'+link.href;
				});
				res2.headers.link = local.httpHeaders.deserialize('link', links);
			}

			// Pipe back
			res.writeHead(res2.status, res2.reason, res2.headers);
			res2.on('data', function(chunk) { res.write(chunk); });
			res2.on('end', function() { res.end(); });
			res2.on('close', function() { res.close(); });
		});
		req.on('data', function(chunk) { req2.write(chunk); });
		req.on('end', function() { req2.end(); });
	});
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


// Navigation Behavior
// ===================

var current_content_origin = null;
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
}

function goForward() {
	chrome_history_position++;
	if (chrome_history_position >= chrome_history.length) {
		chrome_history_position = chrome_history.length - 1;
		return false;
	}
}

function renderFromCache(pos) {
	pos = (typeof pos == 'undefined') ? chrome_history_position : pos;
	var history = chrome_history[pos];

	// Update nav state
	$chrome_url.val(history.url);
	window.location.hash = chrome_history[chrome_history_position].url;
	current_content_origin = history.origin;
	console.debug('new origin', current_content_origin);

	// Render HTML
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
		common.dispatchRequest({ method: 'GET', url: $chrome_url.val(), target: '_content' }, null, { is_refresh: true });
		return false;
	});
	$chrome_url.on('keydown', function(e) {
		if (e.which === 13) {
			common.dispatchRequest({ method: 'GET', url: $chrome_url.val(), target: '_content' });
		}
	});
};

// Collapsible panels
common.layout = $('body').layout({ west__size: 800, west__initClosed: true, east__size: 300, east__initClosed: true });

// Iframe Behaviors
var $iframe = $('main iframe');
local.bindRequestEvents($iframe.contents()[0].body);
$iframe.contents()[0].body.addEventListener('request', function(e) {
	common.dispatchRequest(e.detail, e.target);
});

// Page dispatch behavior
common.dispatchRequest = function(req, origin, opts) {
	opts = opts || {};
	// Relative link? Use context to make absolute
	if (!local.isAbsUri(req.url)) {
		req.url = local.joinUri(current_content_origin, req.url);
	}

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

			// Extract headers
			var x_origin = res.headers['x-origin'];

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
			if (opts.is_refresh && chrome_history[chrome_history_position] && chrome_history[chrome_history_position].url == req.url) {
				// Just update HTML in cache
				chrome_history[chrome_history_position].html = html;
			} else {
				// Expand/reduce the history to include 1 open slot
				if (chrome_history.length > (chrome_history_position+1)) {
					chrome_history.length = chrome_history_position+1;
				}

				// Set origin
				// - if the x_origin is under the same authority, it will be used
				var urld = local.parseUri(req);
				var origin = (urld.protocol || 'httpl')+'://'+urld.authority;
				if (x_origin) {
					if (x_origin.indexOf(origin) === 0) {
						origin = x_origin;
					} else {
						console.warn('Invalid X-Origin header value', x_origin, 'Must be under the authority of', origin);
					}
				}
				chrome_history.push({ url: req.url, html: html, origin: origin });
				chrome_history_position++;

				// Reset view
				if (res.status == 205) {
					goBack();
				}
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
	// Try to find this URI in proximate history
	var hashurl = window.location.hash.slice(1) || 'httpl://feed';
	for (var pos = chrome_history_position-1; pos < (chrome_history_position+1); pos++) {
		if (chrome_history[pos] && chrome_history[pos].url === hashurl) {
			if (chrome_history_position == pos) return;
			chrome_history_position = pos;
			renderFromCache();
			return;
		}
	}
	// Not in history, new request
	common.dispatchRequest(hashurl);
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
},{}],2:[function(require,module,exports){
/*
httpl://explorer

The Link Explorer
 - Renders indexes exported by hosts with the directory protocol
*/


var common = require('./common');

var server = servware();
module.exports = server;

var show_hidden = false;

server.route('/', function(link, method) {
	link({ href: 'httpl://hosts', rel: 'via', id: 'hosts', title: 'Page' });
	link({ href: '/', rel: 'self service', id: 'explorer', title: 'Explorer' });
	link({ href: '/intro', rel: 'service gwr.io/page', id: 'intro', title: 'About' });

	method('GET', function(req, res) {
		if (typeof req.query.show_hidden != 'undefined')
			show_hidden = (req.query.show_hidden == 1);
		var uri = req.query.uri || 'httpl://hosts';
		var uritmpl = local.UriTemplate.parse(uri);
		var ctx = {};
		uritmpl.expressions.forEach(function(expr) {
			if (expr.operator && expr.operator.symbol == '') {
				// This is a path token, ask for values
				expr.varspecs.forEach(function(varspec) {
					ctx[varspec.varname] = prompt(varspec.varname);
					if (ctx[varspec.varname] === null) throw 205; // aborted, reset view
				});
			}
		});
		uri = uritmpl.expand(ctx);
		local.HEAD(uri).always(function(res2) {
			// Build explore interface
			var links = (res2.parsedHeaders.link) ? res2.parsedHeaders.link : [];
			var viaLink = local.queryLinks(links, { rel: 'via !up !self' })[0];
			var upLink = local.queryLinks(links, { rel: 'up !self' })[0];
			var selfLink = local.queryLinks(links, { rel: 'self' })[0];
			if (!viaLink && (!selfLink || selfLink.host_domain != 'hosts')) {
				viaLink = { href: 'httpl://hosts', rel: 'via', title: 'Page' };
			}
			var otherLinks = local.queryLinks(links, { rel: '!via !up !self' });
			var niceuri = (uri.indexOf('httpl://') === 0) ? uri.slice(8) : uri;
			var html = render_explorer({
				uri: uri,
				niceuri: niceuri,
				success: res2.status >= 200 && res2.status < 300,
				status: res2.status + ' ' + (res2.reason||''),

				viaLink: viaLink,
				upLink: upLink,
				selfLink: selfLink,
				links: otherLinks || [],
			});
			res.writeHead(200, 'Ok', {'Content-Type': 'text/html'}).end(html);
		});
	});
});

function icons(link) {
	var icon = 'link';
	if (local.queryLink(link, { rel: 'gwr.io/datauri' }))
		icon = 'file';
	else if (local.queryLink(link, { rel: 'gwr.io/folder' }))
		icon = 'folder-open';
	return '<span class="glyphicon glyphicon-'+icon+'"></span>';
}

function title(link) {
	return link.title || link.id || link.href;
}
function notmpl(uri) {
	return local.UriTemplate.parse(uri).expand({});
}

function render_explorer(ctx) {
	return [
		'<h1>Explorer</h1>',
		// '<form action ="httpl://explorer" method="GET" target="_content">',
		// 	'<input class="form-control" type="text" value="'+ctx.uri+'" name="uri" />',
		// '</form>',
		'<ul class="list-inline" style="padding-top: 5px">',
			[
				((ctx.viaLink) ?
					'<li><a href="httpl://explorer?uri='+encodeURIComponent(ctx.viaLink.href)+'" title="Via: '+title(ctx.viaLink)+'" target="_content">'+title(ctx.viaLink)+'</a></li>'
				: ''),
				((ctx.upLink) ?
					'<li><a href="httpl://explorer?uri='+encodeURIComponent(ctx.upLink.href)+'" title="Up: '+title(ctx.upLink)+'" target="_content">'+title(ctx.upLink)+'</a></li>'
				: ''),
				((ctx.selfLink) ?
					'<li><a href="httpl://explorer?uri='+encodeURIComponent(ctx.selfLink.href)+'" title="Up: '+title(ctx.selfLink)+'" target="_content">'+title(ctx.selfLink)+'</a></li>'
				: ''),
			].filter(function(v) { return !!v; }).join('<li class="text-muted">/</li>'),
			// 	'<a class="glyphicon glyphicon-bookmark" href="httpl://href/edit?href='+encodeURIComponent(ctx.uri)+'" title="is a" target="_card_group"></a>',
			'<li><small class="text-muted">'+ctx.status+'</small>',
        '</ul>',
		'<div class="link-list-outer">',
			'<table class="link-list">',
				'<tbody>',
					ctx.links.map(function(link) {
						var cls='';
						if (link.hidden) {
							if (show_hidden) {
								cls = 'class=\"hidden-link\"';
							} else {
								return '';
							}
						}
						return [
							'<tr '+cls+'>',
								'<td>'+icons(link)+'</td>',
								'<td><a href="httpl://explorer?uri='+encodeURIComponent(link.href)+'" target="_content">'+title(link)+'</a></td>',
								'<td class="text-muted">'+link.href+'</td>',
							'</tr>',
						].join('');
					}).join(''),
				'</tbody>',
			'</table>',
		'</div>',
		((ctx.selfLink) ? [
			'<hr>',
			'<small><a href="'+notmpl(ctx.selfLink.href)+'" title="Open (GET)" target="_content">&raquo; '+title(ctx.selfLink)+'</a></small>',
			'<br>',
			((show_hidden) ?
				'<small><a href="httpl://explorer?uri='+encodeURIComponent(ctx.selfLink.href)+'&show_hidden=0" title="Hide Hidden Links" target="_content">hide hidden</a></small>' :
				'<small><a href="httpl://explorer?uri='+encodeURIComponent(ctx.selfLink.href)+'&show_hidden=1" title="Show Hidden Links" target="_content">show hidden</a></small>'
			)
		].join('') : ''),
	].join('');
}

server.route('/online', function(link, method) {
	method('SHOW', function(req, res) {
		// :DEBUG: temporary helper
		common.layout.toggle('east');
		return 204;
	});
});

server.route('/intro', function(link, method) {
	link({ href: '/', rel: 'up service', id: 'explorer', title: 'Explorer' });
	link({ href: '/intro', rel: 'self service gwr.io/page', id: 'intro', title: 'About' });

	method('GET', function(req, res) {
		req.assert({ accept: 'text/html' });
		return [200, [
			'<div class="row">',
				'<div class="col-xs-8">',
					'<h1>About</h1>',
					'<p>',
						'Grimwire is a <a href="http://gwr.io/" target="_blank">link-driven</a> server platform for WebRTC.',
						'In addition to hosting user programs, it provides tools to <a href="httpl://explorer/online?steal_focus=1" method="SHOW">find peers</a>, <a href="httpl://explorer" target="_content">navigate interfaces</a>, and <a href="httpl://workers/ed/0?steal_focus=1" method="SHOW">edit code</a>.',
					'</p>',
					'<br><br>',
					'<h3>How does it work?</h3>',
					'<p>Grimwire uses...</p>',
					'<ul>',
						'<li><a href="http://www.webrtc.org/" target="_blank">WebRTC</a> for networking.</li>',
						'<li><a href="https://grimwire.com/local" target="_blank">HTTPLocal</a>, a client-side implementation of HTTP, to communicate.</li>',
						'<li><a href="http://en.wikipedia.org/wiki/Server-sent_events"target="_blank">Server-Sent Events</a> from a <a href="https://grimwire.com/download" target="_blank">central server</a> to relay signals.</li>',
						'<li><a href="http://tools.ietf.org/html/rfc5988" target="_blank">Link headers</a> to exchange directories.</li>',
						'<li><a href="https://developer.mozilla.org/en-US/docs/Web/Guide/Performance/Using_web_workers" target="_blank">Web Workers</a> to host user servers.</li>',
						'<li><a href="https://developer.mozilla.org/en-US/docs/Security/CSP/Introducing_Content_Security_Policy" target="_blank">Content Security Policy</a> to restrict what the page will include.</li>',
						'<li>Iframes to sandbox styles.</li>',
					'</ul>',
					'<br><br>',
					'<h3>This is an <strong class="text-danger">unstable</strong> build.</h3>',
					'<p>',
						'Some security policies have not been deployed.',
						'Please be kind to each other!',
					'</p>',
					'<br><br>',
					'<h3>How do I use it?</h3>',
					'<p>Here are some quick getting started tips:</p>',
					'<br><div style="padding: 10px 20px">',
						'<h4 style="margin-top:0">Editing Workers</h4>',
						'<p>Open the workers editor by clicking the gray bar on the far left or by pressing <code>ctrl &larr;</code>.</p>',
						'<div class="thumbnail">',
							'<img src="/img/help_open_worker_panel.png"/>',
						'</div>',
						'<br><hr>',
					'</div>',
					'<br><div style="padding: 10px 20px">',
						'<h4 style="margin-top:0">See Who is Online</h4>',
						'<p>Open the users panel by clicking the gray bar on the far right or by pressing <code>ctrl &rarr;</code>.</p>',
						'<div class="thumbnail">',
							'<img src="/img/help_open_users_panel.png"/>',
						'</div>',
						'<br><hr>',
					'</div>',
					'<br><div style="padding: 10px 20px">',
						'<h4 style="margin-top:0">Publish a Server</h4>',
						'<p>Run a worker locally by pressing the green triangle. Publish it to the entire network by pressing the globe.</p>',
						'<div class="thumbnail">',
							'<img src="/img/help_publish_server.png"/>',
						'</div>',
					'</div>',
					'<br><br>',
					'<h3>Who made Grimwire?</h3>',
					'<p>',
						'<a href="https://twitter.com/pfrazee" target="_blank">Paul Frazee</a>.',//' is an Austin-based developer with over fifteen years of development experience.',
					'</p>',
					'<br><br><br>',
				'</div>',
				'<div class="col-xs-4">',
				'</div>',
			'</div>'
		].join(' '), { 'content-type': 'text/html' }];
	});
});
},{"./common":1}],3:[function(require,module,exports){
/*
httpl://feed

System updates aggregator
*/

var server = servware();
module.exports = server;

var _updates = [];

function mapRev(arr, cb) {
	var newarr = [];
	for (var i=arr.length-1; i >= 0; i--) {
		newarr.push(cb(arr[i], i));
	}
	return newarr;
}

function render_updates() {
	return mapRev(_updates, function(update) {
		return update.html;
	}).join('');
}

server.route('/', function(link, method) {
	link({ href: 'httpl://hosts', rel: 'via', id: 'hosts', title: 'Page' });
	link({ href: '/', rel: 'self service collection', id: 'feed', title: 'Updates Feed' });
	link({ href: '/{id}', rel: 'item', title: 'Update', hidden: true });

	method('GET', function(req, res) {
		var originUntrusted = false; //:TODO:

		var today = (''+new Date()).split(' ').slice(1,4).join(' ');
		res.headers.link[1].title = 'Updates: '+today;
		var html = [
			'<div class="row">',
				'<div class="col-xs-12">',
					'<h1>'+today+'</h1>',
					'<div id="feed-updates">'+render_updates()+'</div>',
				'</div>',
			'</div>'
		].join('');
		return [200, html, {'content-type': 'text/html'}];
	});

	method('POST', function(req, res) {
		req.assert({ type: 'text/html' });
		var origin_untrusted = false; // :TODO:

		var html = req.body;
		if (origin_untrusted) {
			html = '<link href="css/bootstrap.css" rel="stylesheet"><link href="css/iframe.css" rel="stylesheet">'+update.html;
			html = html.replace(/"/g, '&quot;');
			html = '<iframe seamless="seamless" sandbox="allow-popups allow-same-origin allow-scripts" srcdoc="'+html+'"></iframe>';
		} else {
			html = '<div>'+html+'</div>';
		}

		var id = _updates.length;
		_updates.push({ id: id, html: html, created_at: Date.now() });

		// :TODO: replace with nquery
		$('main iframe').contents().find('#feed-updates').html(render_updates());

		res.setHeader('location', 'httpl://'+req.host+'/'+id);
		return 201;
	});
});

server.route('/:id', function(link, method) {
	link({ href: 'httpl://hosts', rel: 'via', id: 'hosts', title: 'Page' });
	link({ href: '/', rel: 'up service collection', id: 'feed', title: 'Updates Feed' });
	link({ href: '/:id', rel: 'self item', id: ':id', title: 'Update :id' });

	method('GET', function(req, res) {
		var update = _updates[req.pathArgs.id];
		if (!update) throw 404;

		var accept = local.preferredType(req, ['text/html', 'application/json']);
		if (accept == 'text/html')
			return [200, html, {'content-type': 'text/html'}];
		if (accept == 'application/json')
			return [200, update, {'content-type': 'application/json'}];
		throw 406;
	});

	method('PUT', function(req, res) {
		req.assert({ type: 'text/html' });
		var origin_untrusted = false; // :TODO:

		var update = _updates[req.pathArgs.id];
		if (!update) throw 404;

		if (/*!from_update_owner*/false) // :TODO:
			throw 403;

		var html = req.body;
		if (origin_untrusted) {
			html = '<link href="css/bootstrap.css" rel="stylesheet"><link href="css/iframe.css" rel="stylesheet">'+update.html;
			html = html.replace(/"/g, '&quot;');
			html = '<iframe seamless="seamless" sandbox="allow-popups allow-same-origin allow-scripts" srcdoc="'+html+'"></iframe>';
		} else {
			html = '<div>'+html+'</div>';
		}

		update.html = html;
		return 204;
	});

	method('DELETE', function(req, res) {
		var update = _updates[req.pathArgs.id];
		if (!update) throw 404;

		delete _updates[req.pathArgs.id];
		return 204;
	});
});
},{}],4:[function(require,module,exports){
var common = require('./common');

// Page state
// ==========

var _session = null, _session_;
var _users = {};
var _session_user = null;

// APIs
var serviceURL = window.location.protocol+'//'+window.location.host;
var serviceUA = local.agent(serviceURL);
var usersUA   = serviceUA.follow({ rel: 'gwr.io/users', link_bodies: 1 });
var sessionUA = serviceUA.follow({ rel: 'gwr.io/session', type: 'user' });
common.feedUA = local.agent('httpl://feed');

// Setup
// =====

common.feedUA.POST('Welcome to Grimwire v0.6 <strong class="text-danger">unstable</strong> build. Please report any bugs or complaints to our <a href="https://github.com/grimwire/grimwire/issues" target="_blank">issue tracker</a>.', { Content_Type: 'text/html' });
common.feedUA.POST('<small class=text-muted>Early Beta Build. Not all behaviors are expected.</small>', {Content_Type: 'text/html'});
common.feedUA.POST('<div style="padding: 10px 0"><img src="/img/exclamation.png" style="position: relative; top: -2px"> <a href="httpl://explorer/intro" target="_content">Start here</a>.</div>', { Content_Type: 'text/html' });
common.dispatchRequest({ method: 'GET', url: /*window.location.hash.slice(1) || */'httpl://feed', target: '_content' });

// So PouchDB can target locals
// local.patchXHR();
// Pouch.adapter('httpl', Pouch.adapters['http']);

// Traffic logging
local.setDispatchWrapper(function(req, res, dispatch) {
	dispatch(req, res).then(
		function() { console.log(req, res); },
		function() { console.error(req, res); }
	);
});

// Servers
var workers_server = require('./workers');
// local.addServer('href', require('./href'));
local.addServer('explorer', require('./explorer'));
local.addServer('feed', require('./feed'));
local.addServer('workers', workers_server);
local.addServer(window.location.host, function(req, res) {
	var req2 = new local.Request({
		method: req.method,
		url: serviceURL+req.path,
		query: local.util.deepClone(req.query),
		headers: local.util.deepClone(req.headers),
		stream: true
	});
	local.dispatch(req2).always(function(res2) {
		res.writeHead(res2.status, res2.reason, res2.headers);
		res2.on('data', function(data) { res.write(data); });
		res2.on('end', function() { res.end(); });
		return res2;
	});
	req.on('data', function(chunk) { req2.write(chunk); });
	req.on('end', function() { req2.end(); });
});

// Request events
local.bindRequestEvents(document.body);
document.body.addEventListener('request', function(e) {
	common.dispatchRequest(e.detail, e.target);
});

// Network relay
var relay = local.joinRelay(serviceURL);
common.setupRelay(relay);


// Backend Interop
// ===============

// Load session
_session_ = sessionUA.get({ Accept: 'application/json' });
_session_.then(setSession);
function setSession(res) {
	// Update state
	var first_time = (_session === null);
	_session = res.body;
	if (_users[_session.user_id]) {
		_session_user = _users[_session.user_id];
	}
	if (first_time) {
		relay.setAccessToken(_session.user_id+':using_cookie');
	}

	// Update UI
	$('#userid').html(_session.user_id+' <b class="caret"></b>');
	renderAll();
}

// Load active users
function loadActiveUsers() {
	usersUA.get({ Accept: 'application/json' })
		.then(
			function(res) {
				_users = res.body.rows;
				if (_session && _users[_session.user_id]) {
					_session_user = _users[_session.user_id];
				}
				renderAll();
			},
			handleFailedRequest
		);
	return false;
	// ^ loadActiveUsers() is sometimes used as a DOM event handler
}
loadActiveUsers();

// Refresh users on tab focus
(function() {
	var lastRefresh = Date.now();
	window.onfocus = function() {
		if (Date.now() - lastRefresh > 60000) {
			loadActiveUsers();
			lastRefresh = Date.now();
		}
	};
})();

// Standard request error handler for our host
function handleFailedRequest(res) {
	if (res.status == 401) {
		// session lost
		alert('Your session has expired, redirecting you to the login page.');
		window.location.reload();
	}
}


// UI Behaviors
// ============

common.setupChromeUI();

// Cache selectors and templates
var $active_links = $('#active-links');
var $your_connections = $('#your-connections');
var renderYourConnections = Handlebars.compile($('#your-connections-tmpl').html());

// Dropdown behaviors
$('.dropdown > a').on('click', function() { $(this).parent().toggleClass('open'); return false; });
$('body').on('click', function() { $('.dropdown').removeClass('open'); });

// Change email link
$('#change-email').on('click', function() {
	if (!_session_user) return false;

	var new_email = prompt('Your current address is '+(_session_user.email?_session_user.email:'not set')+'. Update your address to:');
	if (!new_email) return false;

	// Update or setup update process depending on whether this is the first time
	var userUA = usersUA.follow({ rel: 'gwr.io/user', id: _session.user_id });
	if (!_session_user.email) {
		userUA.PATCH({ email: new_email })
			.then(function() { _session_user.email = new_email; alert('Your email has been updated to '+new_email); })
			.fail(function(res) {
				if (res.status == 422) return alert('Invalid email address. Please check your adress and try again.');
				alert('Sorry! There seems to have been an error while updating your email: '+res.status+' '+res.reason);
			});
	} else {
		userUA.follow({ rel: 'gwr.io/confirmed-update' }).POST({ email: new_email })
			.then(function() { _session_user.email = new_email; alert('An email has been sent to your old address to confirm the update to '+new_email); })
			.fail(function(res) {
				if (res.status == 422) return alert('Invalid email address. Please check your adress and try again.');
				alert('Sorry! There seems to have been an error while updating your email: '+res.status+' '+res.reason);
			});
	}
	return false;
});

// Change password link
$('#change-pw').on('click', function() {
	if (!_session_user) return false;
	if (!_session_user.email) {
		alert('Password updates require an email account to confirm identity. Please use the "Change Email" to set this first.');
		return false;
	}
	if (!confirm('For security purposes, a confirmation email will be sent to '+_session_user.email+' with an update link. Send the email?')) {
		return false;
	}
	usersUA.follow({ rel: 'gwr.io/user', id: _session.user_id })
		.follow({ rel: 'gwr.io/confirmed-update' })
		.POST({ password: true })
		.then(function() { alert('Check your inbox for the confirmation link.'); })
		.fail(function(res) { alert('Sorry! There seems to have been an error while updating your email: '+res.status+' '+res.reason); });
	return false;
});

// Logout link
$('#logout').on('click', function(e) {
	sessionUA.delete()
		.then(window.location.reload.bind(window.location), function() {
			console.warn('Failed to delete session');
		});
	return false;
});

// Refresh button
$('#refresh-active-links').on('click', loadActiveUsers);

// Guest slot +/- buttons
var _updateGuestStreamsReq = null;
var _updateGuestBufferingTimeout = null;
function updateGuestSlotsCB(d_streams) {
	return function() {
		if (_session_user) {
			// Find the target
			var target = _session_user.max_guest_streams + d_streams;
			if (target < _session_user.num_guest_streams) return false;
			if (target > (_session_user.max_user_streams - _session_user.num_user_streams)) return false;
			_session_user.max_guest_streams = target;

			// Cancel any requests in progress
			if (_updateGuestStreamsReq) {
				_updateGuestStreamsReq.close();
			}
			if (_updateGuestBufferingTimeout) {
				clearTimeout(_updateGuestBufferingTimeout);
			}

			renderUserConnections();
			_updateGuestBufferingTimeout = setTimeout(function() {
				// Create the request
				_updateGuestStreamsReq = new local.Request({
					method: 'PATCH',
					headers: { 'content-type': 'application/json' }
				});
				usersUA.follow({ rel: 'item', id: _session.user_id })
					.dispatch(_updateGuestStreamsReq)
					.then(renderUserConnections);
				_updateGuestStreamsReq.end({ max_guest_streams: target });
			}, 250);
		}
		return false;
	};
}


// Avatars
// =======

(function() {
	var arr=[];
	_avatars = JSON.parse($('#avatars').text());
	var nAvatars = _avatars.length;
	$('.avatars').html(
		_avatars.sort().map(function(avatar, i) {
			// Add the avatar to the array
			arr.push('<a href="javascript:void(0)" data-avatar="'+avatar+'"><img src="/img/avatars/'+avatar+'" title="'+avatar+'" /></a>');
			// Flush the array on every 8th (or the last)
			if (arr.length === 8 || i === nAvatars-1) {
				var str = '<li>'+arr.join('')+'</li>';
				arr.length = 0;
				return str;
			}
			return '';
		}).join('')
	);
})();
$('.avatars a').on('click', function() {
	var avatar = $(this).data('avatar');

	// Update UI
	$('.avatars a.selected').removeClass('selected');
	$(this).addClass('selected');
	$('.user-avatar').attr('src', '/img/avatars/'+avatar);

	// Update the user
	usersUA.follow({ rel: 'item', id: _session.user_id }).patch({ avatar: avatar });
	_session.avatar = avatar;

	return false;
});


// Rendering Helpers
// =================

function renderLinkRow(link) {
	var urld = local.parseUri(link.href);
	var peerd = local.parsePeerDomain(urld.authority);
	var appUrl = peerd ? peerd.app : urld.authority;

	var html = '<tr><td data-local-alias="a" href="'+link.href+'" target="_content">'+(link.title||link.href);
	if (appUrl != window.location.host) {
		html += '<a class="pull-right" href="http://'+appUrl+'" target="_blank">'+appUrl+'</a>';
	}
	return html+'</td></tr>';
}
function renderLinks(userId) {
	return (_users[userId]) ? _users[userId].links.map(renderLinkRow).join('') : '';
}
function renderWorkerLinks(userId) {
	return Object.keys(workers_server.active_workers).map(function(domain) {
		return renderLinkRow({ href: 'httpl://'+domain, title: domain });
	}).join('');
}

// Update connections view
function renderUserConnections() {
	if (_session_user) {
		// Render active connections
		var max_guest_streams = Math.min(_session_user.max_user_streams - _session_user.num_user_streams, _session_user.max_guest_streams);
		html = renderYourConnections({
			num_user_streams: _session_user.num_user_streams,
			max_user_streams: _session_user.max_user_streams,
			num_guest_streams: _session_user.num_guest_streams,
			max_guest_streams: _session_user.max_guest_streams,
			pct_user_streams: Math.round((_session_user.num_user_streams / _session_user.max_user_streams) * 100),
			pct_guest_streams: Math.round((_session_user.num_guest_streams / _session_user.max_user_streams) * 100),
			pct_guest_remaining: Math.round(((max_guest_streams - _session_user.num_guest_streams) / _session_user.max_user_streams) * 100)
		});
		$your_connections.html(html);

		// Bind guest slot add/remove btns
		$('#remove-guest-slot').on('click', updateGuestSlotsCB(-1));
		$('#add-guest-slot').on('click', updateGuestSlotsCB(+1));
	} else {
		$your_connections.html('');
	}
}

// Update UI state
function renderAll() {
	var html;

	if (_session && Object.keys(_users).length > 0) {
		// Set active avatar
		$('.avatars a[data-avatar="'+_session.avatar+'"]').addClass('selected');

		// Session user
		html = '<h3><img class="user-avatar" src="/img/avatars/'+_session.avatar+'" /> '+_session.user_id+' <small>this is you!</small></h3>';
		html += '<table id="'+_session.user_id+'-links" class="table table-hover table-condensed">'+renderLinks(_session.user_id)+renderWorkerLinks()+'</table>';

		// Other users
		var html2 = '';
		for (var id in _users) {
			var user = _users[id];
			if (user.id == _session.user_id) { continue; }
			if (user.online) {
				html += '<h4><img src="/img/avatars/'+user.avatar+'" /> '+user.id+'</h4>';
				html += '<table id="'+user.id+'-links" class="table table-hover table-condensed">' + renderLinks(user.id) + '</table>';
			} else {
				html2 += '<p style="margin:0"><small><img src="/img/avatars/'+user.avatar+'" /> '+user.id+' offline</small></p>';
			}
		}

		// Render
		$active_links.html(html+html2);
	} else {
		$active_links.html('');
	}

	renderUserConnections();
}
renderAll();
},{"./common":1,"./explorer":2,"./feed":3,"./workers":5}],5:[function(require,module,exports){
// workers
// =======

var common = require('./common');

// constants
var default_script_src = "importScripts('/js/local.js');\nimportScripts('/js/servware.js');\n\nvar server = servware();\nlocal.worker.setServer(server);\n\nserver.route('/', function(link, method) {\n    link({ href: '/', rel: 'self via service', title: 'Hello World Worker' });\n\n    method('GET', function(req, res) {\n        return [200, 'Hello, world!'];\n    });\n});\n/**\n * Be sure to open the tutorials.\n * in the Worker dropdown.\n* (top left!)\n */\n";
var whitelist = [ // a list of global objects which are allowed in the worker
	'null', 'self', 'console', 'atob', 'btoa',
	'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
	'Proxy',
	'importScripts', 'navigator',
	'postMessage', 'addEventListener', 'removeEventListener',
	'onmessage', 'onerror'
];
var whitelistAPIs_src = [ // nullifies all toplevel variables except those listed above in `whitelist`
	'(function() {',
		'var nulleds=[];',
		'var whitelist = ["'+whitelist.join('", "')+'"];',
		'for (var k in self) {',
			'if (whitelist.indexOf(k) === -1) {',
				'Object.defineProperty(self, k, { value: null, configurable: false, writable: false });',
				'nulleds.push(k);',
			'}',
		'}',
		'console.log("Nullified: "+nulleds.join(", "));',
	'})();\n'
].join('');
var importScriptsPatch_src = [ // patches importScripts() to allow relative paths
	'(function() {',
		'var orgImportScripts = importScripts;',
		'importScripts = function() {',
			'return orgImportScripts.apply(null, Array.prototype.map.call(arguments, function(v, i) {',
				'return (v.charAt(0) == \'/\') ? (\''+window.location.origin+'\'+v) : v;',
			'}));',
		'};',
	'})();\n'
].join('');
var bootstrap_src = whitelistAPIs_src + importScriptsPatch_src;

// state
var installed_workers;// = [/* string* */] loaded from local storage
var active_workers = {/* name -> WorkerServer */};
var active_editors = {/* name -> data */};
var editor_id_counter = 0;
var the_active_editor = 0;
var $ace_editor_el = $('#ace');

// load editor
function resizeEditors() {
	for (var k in active_editors) {
		active_editors[k].$div.height($(window).height() - active_editors[k].$div.offset().top);
	}
}
$(window).resize(resizeEditors);

// load workers
try { installed_workers = JSON.parse(localStorage.getItem('workers')) || []; }
catch(e) {}
installed_workers.forEach(function(name) {
	local.dispatch({ method: 'OPEN', url: 'httpl://workers/ed?name='+name });
});
if (installed_workers.length === 0) {
	local.dispatch({ method: 'NEW', url: 'httpl://workers/ed' });
}
renderEditorChrome();


// App Local Server
// -
var app_local_server = servware();
module.exports = app_local_server;
module.exports.active_workers = active_workers;

// root
app_local_server.route('/', function(link, method) {
	link({ href: '/', rel: 'self service', id: 'workers', title: 'Worker Programs' });
	link({ href: '/w', rel: 'collection', id: 'w', title: 'Installed' });
	link({ href: '/ed', rel: 'collection', id: 'ed', title: 'Editors', hidden: true });

	method('GET', function() {
		return 204;
	});
});

// editor collection
app_local_server.route('/ed', function(link, method) {
	link({ href: '/', rel: 'via up service', id: 'workers', title: 'Worker Programs' });
	link({ href: '/ed', rel: 'self collection', id: 'ed', title: 'Editors' });
	link({ href: '/ed/{id}', rel: 'item', title: 'Lookup by ID' });

	method('HEAD', function(req, res) {
		for (var k in active_editors) {
			res.link({ href: '/ed/'+k, rel: 'item', id: k, title: 'Editor '+k });
		}
		return 204;
	});

	// ui methods

	method('NEW', function(req, res) {
		// Hide current editor
		if (active_editors[the_active_editor]) {
			active_editors[the_active_editor].$div.hide();
		}

		// Alocate id
		the_active_editor = editor_id_counter++;

		// Create new editor div
		$ace_editor_subdiv = $('<div id="ace-'+the_active_editor+'">'+default_script_src+'</div>');
		$ace_editor_el.append($ace_editor_subdiv);
		$ace_editor_subdiv.height($(window).height() - $ace_editor_el.offset().top);

		// Create new ace editor
		var ace_editor = ace.edit('ace-'+the_active_editor);
		ace_editor.setTheme("ace/theme/textmate");
		ace_editor.getSession().setMode("ace/mode/javascript");

		// Store
		active_editors[the_active_editor] = {
			name: null,
			url: null,
			ua: null,
			$div: $ace_editor_subdiv,
			ace_editor: ace_editor
		};
		renderEditorChrome();
		return 204;
	});

	method('OPEN', function(req, res) {
		var url = req.query.url, name = req.query.name;
		if (!url && name) url = 'httpl://'+req.host+'/w/'+req.query.name;
		if (!url) url = prompt('Enter the URL of the script');
		if (!url) throw 404;
		if (!name) name = url.split('/').slice(-1)[0];
		if (name.slice(-3) != '.js') name = name + '.js';

		return local.GET({ url: url, Accept: 'application/javascript' })
			.then(function(res) {
				// Hide current editor
				if (active_editors[the_active_editor]) {
					active_editors[the_active_editor].$div.hide();
				}

				// Alocate id
				the_active_editor = editor_id_counter++;

				// Create new editor div
				res.body = common.escape(res.body.replace(/&/g, '&amp;'));
				$ace_editor_subdiv = $('<div id="ace-'+the_active_editor+'">'+res.body+'</div>');
				$ace_editor_el.append($ace_editor_subdiv);
				$ace_editor_subdiv.height($(window).height() - $ace_editor_el.offset().top);

				// Create new ace editor
				var ace_editor = ace.edit('ace-'+the_active_editor);
				ace_editor.setTheme("ace/theme/textmate");
				ace_editor.getSession().setMode("ace/mode/javascript");

				// Store
				url = 'httpl://'+req.host+'/w/'+name; // now store locally
				active_editors[the_active_editor] = {
					name: name,
					url: url,
					ua: local.agent(url),
					$div: $ace_editor_subdiv,
					ace_editor: ace_editor
				};
				renderEditorChrome();
				if (req.query.steal_focus) {
					common.layout.open('west');
				}
				return 204;
			})
			.fail(function(res) {
				alert('Failed to load script: '+res.status+' '+res.reason);
				console.error('Failed to fetch script', res);
				throw 502;
			});
	});

	method('SAVE', function(req, res) {
		var ed = active_editors[the_active_editor];
		if (!ed) { throw 404; }

		if (!ed.name || req.query.rename == 1) {
			var oldname = ed.name, newname;
			while (true) {
				newname = prompt('Enter a name for this worker:', (oldname||''));
				if (!newname) throw 404; // no value given, abort
				if (newname.slice(-3) != '.js') newname = newname + '.js'; // make sure ends with .js
				if (newname != oldname && installed_workers.indexOf(newname) !== -1) {
					if (confirm('The worker "'+newname+'" already exists. Overwrite it?'))
						break; // a good name
				} else
					break; // a good name
			}
			ed.name = newname;
			ed.url = 'httpl://'+req.host+'/w/'+encodeURIComponent(common.escape(newname));
			ed.ua = local.agent(ed.url);
		}

		return ed.ua.PUT(ed.ace_editor.getValue()||'', { Content_Type: 'application/javascript' })
			.then(function(res) { renderEditorChrome(); return 204; })
			.fail(function(res) {
				console.error('Failed to store script', res);
				throw 502;
			});
	});

	method('CLOSE', function(req, res) {
		if (!active_editors[the_active_editor]) throw 404;
		active_editors[the_active_editor].ace_editor.destroy();
		active_editors[the_active_editor].$div.remove();
		delete active_editors[the_active_editor];

		new_active_editor = Object.keys(active_editors).slice(-1)[0];
		local.dispatch({ method: 'SHOW', url: 'httpl://'+req.host+'/ed/'+new_active_editor });

		return 204;
	});

	method('DELETE', function(req, res) {
		if (!active_editors[the_active_editor]) throw 404;
		if (!confirm('Delete '+active_editors[the_active_editor].name+'. Are you sure?')) throw 400;
		active_editors[the_active_editor].ua.DELETE();
		local.dispatch({ method: 'CLOSE', url: 'httpl://'+req.host+'/ed' });

		return 204;
	});

	method('START', function(req, res) {
		if (!active_editors[the_active_editor]) throw 404;
		return local.dispatch({ method: 'SAVE', url: 'httpl://'+req.host+'/ed' })
			.then(function() { return active_editors[the_active_editor].ua.dispatch({ method: 'START', query: { network: req.query.network } }); })
			.then(function() { renderEditorChrome(); return 204; })
			.fail(function(res) { console.error('Failed to start worker', req, res); throw 502; });
	});

	method('STOP', function(req, res) {
		if (!active_editors[the_active_editor]) throw 404;
		return active_editors[the_active_editor].ua.dispatch({ method: 'STOP' })
			.then(function(res) { renderEditorChrome(); return 204; })
			.fail(function(res) { console.error('Failed to stop worker', req, res); throw 502; });
	});
});

// editor item
app_local_server.route('/ed/:id', function(link, method) {
	link({ href: '/', rel: 'via service', id: 'workers', title: 'Worker Programs' });
	link({ href: '/ed', rel: 'up collection', id: 'ed', title: 'Editors' });
	link({ href: '/ed/:id', rel: 'self item', id: ':id', title: 'Editor :id' }); // :TODO: uri templates

	// UI methods

	method('SHOW', function(req, res) {
		var id = req.pathArgs.id;
		if (!active_editors[id]) { throw 404; }
		if (active_editors[the_active_editor])
			active_editors[the_active_editor].$div.hide();
		the_active_editor = +id;
		active_editors[the_active_editor].$div.show();
		renderEditorChrome();
		resizeEditors();
		if (req.query.steal_focus) {
			common.layout.toggle('west');
		}
		return 204;
	});
});

// worker collection
app_local_server.route('/w', function(link, method) {
	link({ href: '/', rel: 'via up service', id: 'programs', title: 'Worker Programs' });
	link({ href: '/w', rel: 'self collection', id: 'w', title: 'Installed' });
	link({ href: '/w/{id}', rel: 'item', title: 'Lookup by Name' });

	method('HEAD', function(req, res) {
		installed_workers.forEach(function(name) {
			res.link({ href: '/w/'+name, rel: 'item', id: name, title: name });
		});
		return 204;
	});
});

// worker item
app_local_server.route('/w/:id', function(link, method) {
	link({ href: '/', rel: 'via service', id: 'programs', title: 'Worker Programs' });
	link({ href: '/w', rel: 'up collection', id: 'w', title: 'Installed' });
	link({ href: '/w/:id', rel: 'self item', id: ':id', title: 'Worker: :id' });

	// CRUD methods

	method('HEAD', function(req, res) {
		var js = localStorage.getItem('worker_'+req.pathArgs.id);
		if (!js) throw 404;
		return 204;
	});

	method('GET', function(req, res) {
		req.assert({ accept: ['application/javascript', 'text/javascript', 'text/plain'] });
		var js = localStorage.getItem('worker_'+req.pathArgs.id);
		if (!js) throw 404;
		res.setHeader('Content-Type', 'application/javascript');
		return [200,  js];
	});

	method('PUT', function(req, res) {
		var name = req.pathArgs.id;
		req.assert({ type: ['application/javascript', 'text/javascript', 'text/plain'] });
		localStorage.setItem('worker_'+name, req.body || '');
		if (installed_workers.indexOf(name) === -1) {
			installed_workers.push(name);
			localStorage.setItem('workers', JSON.stringify(installed_workers));
		}
		return 204;
	});

	method('DELETE', function(req, res) {
		var name = req.pathArgs.id;

		// stop worker
		local.dispatch({ method: 'STOP', url: 'programs/w/'+name });

		// update listing
		var name_index = installed_workers.indexOf(name);
		if (name_index !== -1) {
			installed_workers.splice(name_index, 1);
			localStorage.setItem('workers', JSON.stringify(installed_workers));
		}

		// update script
		localStorage.removeItem('worker_'+name);

		return 204;
	});

	// Worker control methods

	method('START', function(req, res) {
		var name = req.pathArgs.id;

		// Unload script if active
		if (active_workers[name]) {
			active_workers[name].terminate();
			local.removeServer(name);
		}

		// (Try to) Load script from localstorage
		var script = localStorage.getItem('worker_'+name) || '';

		// Prepend bootstrap script and convert to a URI
		// var src = 'data:text/javascript;charset=US-ASCII,' + encodeURIComponent(script);
		// ^ https://code.google.com/p/chromium/issues/detail?id=270979
		var scriptblob = new Blob([bootstrap_src+'(function(){'+script+'})();']);
		var src = URL.createObjectURL(scriptblob);

		// Spawn server
		active_workers[name] = local.spawnWorkerServer(src, { domain: name, on_network: !!(req.query.network) }, worker_remote_server);
		// active_workers[name].getPort().addEventListener('error', onError, false); ?
		common.publishNetworkLinks();

		return 204;
	});

	method('STOP', function(req, res) {
		var name = req.pathArgs.id;

		// Unload script if active
		if (active_workers[name]) {
			active_workers[name].terminate();
			local.removeServer(name);
		}
		delete active_workers[name];
		common.publishNetworkLinks();

		return 204;
	});
});


// Worker Remote Server
// -
var worker_remote_server = function(req, res, worker) {
	if (!req.query.uri) {
		res.setHeader('Link', [
			{ href: '/{?uri}', rel: 'self service', title: 'Host Application' },
			{ href: '/?uri=httpl://hosts', rel: 'service', id: 'hosts', title: 'Page Hosts' }
		]);
		return res.writeHead(204).end();
	}

	// :TODO: for now, simple pass-through proxy into the local namespace
	var req2 = new local.Request({
		method: req.method,
		url: req.query.uri,
		headers: local.util.deepClone(req.headers),
		stream: true
	});
	req2.headers['From'] = worker.config.domain;
	var res2_ = local.dispatch(req2)
	res2_.always(function(res2) {
		res.writeHead(res2.status, res2.reason, res2.headers);
		res2.on('data', function(chunk) { res.write(chunk); });
		res2.on('end', function() { res.end(); });
		res2.on('close', function() { res.close(); });
	});
	req.on('data', function(chunk) { req2.write(chunk); });
	req.on('end', function() { req2.end(); });
};


// Worker Local Request Patch
// - modifies requests sent to the workers
local.WorkerBridgeServer.prototype.handleLocalRequest = function(request, response) {
	if (request.headers['X-Public-Host']) {
		request.headers['X-Public-Host'] = local.joinUri(request.headers['X-Public-Host'], request.host);
	}
	local.BridgeServer.prototype.handleLocalRequest.call(this, request, response);
};

// Helpers
// -

function renderEditorChrome() {
	var html = '';
	for (var k in active_editors) {
		var name = (active_editors[k].name) ? common.escape(active_editors[k].name) : 'untitled';
		var active = (the_active_editor === +k) ? 'active' : '';
		var glyph = '';
		if (active_workers[name]) {
			glyph = '<b class="glyphicon glyphicon-play"></b> ';
			if (active_workers[name].config.on_network) {
				glyph += '<b class="glyphicon glyphicon-globe"></b> ';
			}
		}
		if (installed_workers.indexOf(name) === -1) {
			name += '*'; // unsaved
		}
		html += '<li class="'+active+'"><a href="httpl://workers/ed/'+k+'" method="SHOW" title="'+name+'">'+glyph+name+'</a></li>';
	}
	if (active_editors[the_active_editor]) {
		$('#worker-inst-link').attr('href', 'httpl://'+active_editors[the_active_editor].name);
	}
	$('#worker-open-dropdown').html([
		'<li><a method="OPEN" href="httpl://workers/ed">From URL</a></li>',
		installed_workers.map(function(name) {
			return '<li><a method="OPEN" href="httpl://workers/ed?name='+common.escape(encodeURIComponent(name))+'">'+common.escape(name)+'</a></li>';
		}).join('')
	].join(''));
    $('#worker-editor > .nav-tabs').html(html);
}
},{"./common":1}]},{},[4])
;