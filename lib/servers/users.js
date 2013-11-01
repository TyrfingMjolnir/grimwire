var express = require('express');
var middleware = require('../middleware.js');
var util = require('../util.js');
var bcrypt = require('bcrypt');
var winston = require('winston');

// Users
// =====
module.exports = function(config, db) {

	// Server State
	// ============
	var server = express();
	// Active relays
	// - maps "{username}@{this_hostname}!{app_domain}:{stream_id}" -> http.ServerResponse
	var _online_relays = {};
	// Active users
	// - maps username -> [{id:username,links:[...], ...]
	var _online_users = {};

	var peerUriRE = /^(.+)@([^!]+)!([^:\/]+)(?::([\d]+))?$/i;
	function createPeerUri(user, app, stream) {
		// this function must mirror the local.js PeerWebRelay.prototype.makeDomain definition
		return user+'@'+config.hostname.replace(':','.')+'!'+app.replace(':','.')+':'+(stream||'0');
	}
	function createOnlineUser(userRecord, session) {
		return {
			id: session.user_id,
			links: []
		};
	}

	// For use in /status
	server.getStatus = function() {
		return {
			num_streams: Object.keys(_online_relays).length,
			num_online_users: Object.keys(_online_users).length
		};
	};

	// Routes
	// ======

	// Middleware
	// ----------
	server.get('/', middleware.authenticate(config, db));
	server.all('/:userId', middleware.authenticate(config, db));
	server.all('/:userId/s/:appDomain/:streamId', middleware.authenticate(config, db));

	// Linking
	// -------
	server.all('/', function (req, res, next) {
		// Set links
		var links = [
			'</>; rel="up via service gwr.io/relay gwr.io/user"; title="Grimwire Relay"',
			'</u{?online,links}>; rel="self collection gwr.io/relay gwr.io/user"; id="users"',
			'</u/{id}>; rel="item gwr.io/user"',
			'</u/{user}/s/{app}/{stream}{?nc}>; rel="item gwr.io/relay"'
		];
		if (req.query.links) {
			// Add all online links
			for (var id in _online_users) {
				links = links.concat(_online_users[id].links.map(serializeLinkObject));
			}
		}
		res.setHeader('Link', links.join(', '));
		next();
	});
	server.all('/:userId', function (req, res, next) {
		// Set links
		var userId = req.params.userId;
		res.setHeader('Link', [
			'</>; rel="via service gwr.io/relay gwr.io/user"; title="Grimwire Relay"',
			'</u{?online,links}>; rel="up collection gwr.io/relay gwr.io/user"; id="users"',
			'</u/'+userId+'>; rel="self item gwr.io/user"; id="'+userId+'"',
			'</u/'+userId+'/s/{app}/{stream}{?nc}>; rel="item gwr.io/relay"'
		].join(', '));
		next();
	});
	server.all('/:userId/s/:appDomain/:streamId', function(req, res, next) {
		// Set links
		var userId = req.params.userId;
		var appDomain = req.params.appDomain;
		var streamId = req.params.streamId;
		res.setHeader('Link', [
			'</>; rel="via service gwr.io/relay gwr.io/user"; title="Grimwire Relay"',
			'</u/'+userId+'>; rel="up item gwr.io/user"; id="'+userId+'"',
			'</u/'+userId+'/s/'+appDomain+'/'+streamId+'{?nc}>; rel="self item gwr.io/relay"'
		].join(', '));
		next();
	});

	// Get users
	// ---------
	server.head('/', function(req, res) { return res.send(204); });
	server.get('/',
		function(req, res, next) {
			// Content-negotiation
			if (!req.accepts('json')) {
				return res.send(406);
			}

			// Load full list from DB
			db.getUsers(function(err, users) {
				if (err) {
					winston.error('Failed to load users from DB', { error: err, inputs: [], request: util.formatReqForLog(req) });
					return res.send(500);
				}

				res.locals.users = users;
				next();
			});
		},
		function(req, res) {
			// Construct output
			var rows = {}, users = res.locals.users;
			var sessionUserId = res.locals.session.user_id;
			for (var k in users) {
				var user = users[k];
				// Get user's online status
				var onlineUser = _online_users[user.id];
				// Filter by online, if requested
				if (req.query.online && !onlineUser) {
					continue;
				}
				// Add row
				rows[user.id] = {
					id: user.id,
					online: !!onlineUser,
					avatar: user.avatar,
					created_at: user.created_at
				};
			}

			// Send response
			return res.json({ rows: rows });
		}
	);

	// Create user
	// -----------
	server.post('/', function (req, res, next) {
		var session = res.locals.session;
		// Content negotiation
		if (!req.is('json')) {
			return res.send(415);
		}

		// Validate body
		var body = req.body;
		if (!body || !body.id || !body.password) {
			return res.send(422, { error: 'Must include `id` and `password`' });
		}
		if (typeof body.id != 'string' || typeof body.password != 'string') {
			return res.send(422, { error: '`id` and `password` must be strings' });
		}
		if (!/^[-a-z0-9_]+$/i.test(body.id)) {
			return res.send(422, { error: '`id` must pass /^[-a-z0-9_]+$/i' });
		}
		if (body.email && typeof body.email != 'string') {
			return res.send(422, { error: '`email` must be a string, if provided' });
		}

		// Hash the password
		bcrypt.genSalt(10, function(err, salt) {
			bcrypt.hash(body.password, salt, function(err, hash) {
				if (err) {
					winston.error('Failed to encrypt user password', { error: err, inputs: [body.password, salt], request: util.formatReqForLog(req) });
					return res.send(500);
				}
				body.password = hash;

				// Try to insert
				db.createUser(body, function(err) {
					if (err) {
						if (err.conflict) {
							return res.send(409);
						} else {
							winston.error('Failed to add user to database', { error: err, inputs: [body], request: util.formatReqForLog(req) });
							return res.send(500);
						}
					}

					// Send response
					res.send(204);
				});
			});
		});
	});

	// Get user info
	// -------------
	server.head('/:userId', function(req, res) { return res.send(204); });
	server.get('/:userId', function(req, res, next) {
		// Content negotiation
		if (!req.accepts('json')) {
			return res.send(406);
		}

		// Get user
		var online_user = _online_users[req.params.userId];
		db.getUser(req.params.userId, function(err, user) {
			if (!user) {
				return res.send(404);
			}

			res.json({ item: {
				id: user.id,
				online: !!online_user,
				avatar: user.avatar,
				created_at: user.created_at
			}});
		});
	});

	// Update user/settings
	// --------------------
	server.patch('/:userId', function (req, res, next) {
		var session = res.locals.session;
		// Content negotiation
		if (!req.is('json')) {
			return res.send(415);
		}

		// Only allow users to update their own accounts
		if (req.params.userId != session.user_id) {
			return res.send(403);
		}

		// Validate message
		if (!req.body) {
			return res.send(422, { error: 'Request body is required.' });
		}
		var updates = {};
		if (req.body.avatar) {
			if (typeof req.body.avatar != 'string') {
				return res.send(422, { error: '`avatar` must be a string.'});
			}
			updates.avatar = req.body.avatar;
		}
		if (req.body.email) {
			if (typeof req.body.email != 'string') {
				return res.send(422, { error: '`email` must be a string.'});
			}
			updates.email = req.body.email;
		}
		if (Object.keys(updates).length === 0) {
			return res.send(422, { error: 'No valid fields in the request body.' });
		}

		// Update DB
		db.updateUser(req.params.userId, updates, function(err) {
			if (err) {
				winston.error('Failed to update user in DB', { error: err, inputs: [req.params.userId], request: util.formatReqForLog(req) });
				return res.send(500);
			}
			db.updateSession(session.id, updates, function(err) {
				if (err) {
					winston.error('Failed to update session in DB', { error: err, inputs: [req.params.userId], request: util.formatReqForLog(req) });
					return res.send(500);
				}

				// Finally, update memory
				var online_user = _online_users[req.params.userId];
				if (online_user) {
					// jk (currently, nothing needs updating on the online user object)
				}

				// Send response
				res.send(204);
			});
		});
	});

	// Get Stream Info
	// ---------------
	server.head('/:userId/s/:appDomain/:streamId', function(req, res) { return res.send(204); });
	server.get('/:userId/s/:appDomain/:streamId', function(req, res, next) {
		// Content negotiation
		if (!req.accepts('json')) {
			return res.send(406);
		}

		// Fetch user & stream
		var peerUri = createPeerUri(req.params.userId, res.params.appDomain, res.params.streamId);
		var stream = _online_relays[peerUri];
		var user = _online_users[req.params.userId];
		if (!stream || !user) {
			return res.send(404);
		}

		// Extract links
		var links = user.links.filter(function(link) { return link.app == res.params.appDomain && link.stream == res.params.streamId; });

		// Send response
		return res.json({ links: links });
	});

	// Update Stream Info
	// ------------------
	server.patch('/:userId/s/:appDomain/:streamId', function(req, res, next) {
		var session = res.locals.session;
		var peerUri = createPeerUri(req.params.userId, req.params.appDomain, req.params.streamId);

		// Fetch user & stream
		var stream = _online_relays[peerUri];
		var user = _online_users[req.params.userId];
		if (!stream || !user) {
			return res.send(404);
		}

		// Content negotiation
		if (!req.is('json')) {
			return res.send(415);
		}

		// Only allow users & apps to update their own streams
		if (req.params.userId != session.user_id || session.app != req.params.appDomain) {
			return res.send(403);
		}

		// Validate message
		if (!req.body) {
			return res.send(422, { error: 'Request body is required.' });
		}
		var updates = {};
		if (req.body.links) {
			var appBaseUrl = 'httpl://'+peerUri;
			links = req.body.links;
			if (!Array.isArray(links))
				links = [links];

			for (var i=0; i < links.length; i++) {
				var link = links[i];

				// Validate
				if (!link || typeof link != 'object' || !link.href) {
					return res.send(422, { error: 'Link '+i+' did not parse into a link object' });
				}

				// Prepend the host on relative uris
				if (link.href.charAt(0) == '/') {
					link.href = appBaseUrl + link.href;
				}

				// Add the grimwire app rel to the top-level link
				if (link.href == appBaseUrl || link.href == appBaseUrl+'/') {
					if (!/(^|\b)grimwire.com\/\-app($|\b)/i.test(link.rel)) {
						link.rel += ' gwr.io/app';
					}
				}
			}
			updates.links = links;
		}
		if (Object.keys(updates).length === 0) {
			return res.send(422, { error: 'No valid fields in the request body.' });
		}

		// Update stream
		if (updates.links) {
			removeUserLinks(user, stream);
			addUserLinks(user, stream, updates.links);
		}

		// Respond
		return res.send(204);
	});

	// Subscribe to stream
	// -------------------
	server.subscribe('/:userId/s/:appDomain/:streamId', function(req, res) {
		var session = res.locals.session;
		var session_app = session.app || config.hostname;

		// Content negotiation
		if (!req.accepts('text/event-stream')) {
			return res.send(406);
		}

		// Only allow users to subscribe to their own relays
		if (req.params.userId != session.user_id) {
			return res.send(403);
		}
		if (req.params.appDomain != session_app) {
			return res.send(403);
		}

		// Store params in response stream
		res.locals.userId   = req.params.userId;
		res.locals.app      = req.params.appDomain;
		res.locals.streamId = req.params.streamId;
		res.locals.peerUri  = createPeerUri(res.locals.userId, res.locals.app, res.locals.streamId);

		// Check stream availability
		if ((res.locals.peerUri in _online_relays)) {
			return res.send(423);
		}

		// Store connection
		addStream(res, function(err) {
			if (err) {
				return res.send(500);
			}

			// Send back stream header
			res.writeHead(200, 'ok', {
				'content-type': 'text/event-stream',
				'cache-control': 'no-cache',
				'connection': 'keepalive'
			});
			res.write('\n'); // Writing to the stream lets the client know its open
		});
	});

	// Broadcast to a stream
	// ---------------------
	server.notify('/:userId/s/:appDomain/:streamId', function (req, res, next) {
		var session = res.locals.session;
		var session_app = session.app || config.hostname;

		// Content negotiation
		if (!req.is('json')) {
			return res.send(415);
		}

		// Only allow users to broadcast via their own relays
		if (req.params.userId != session.user_id) {
			return res.send(403);
		}
		if (req.params.appDomain != session_app) {
			return res.send(403);
		}

		// Validate message
		var body = req.body;
		if (!body || !body.msg || !body.dst || !body.src) {
			return res.send(422, { error: 'Request body must include `msg`, `dst`, and `src`.' });
		}
		var srcParsed = peerUriRE.exec(body.src);
		if (!srcParsed) {
			return res.send(422, { error: '`src` is not a valid peer domain: must conform to /^(.+)@([^!]+)!([^:\\/]+)(?::([\\d]+))?$/i.' });
		}
		if (srcParsed[1] != session.user_id || srcParsed[3] != session_app.replace(':','.')) {
			return res.send(422, { error: '`src` must match the sending application (your session shows '+session.user_id+' and '+session_app+')' });
		}

		// Iterate destinations
		var successes=0;
		var peerUri, data = { dst: null, src: body.src, msg: body.msg };
		if (!Array.isArray(body.dst)) { body.dst = [body.dst]; }
		for (var i=0; i < body.dst.length; i++) {
			// Make sure the target relay is online
			if (!(body.dst[i] in _online_relays)) {
				// Try default stream
				if (!(body.dst[i]+':0' in _online_relays)) {
					continue;
				}
				body.dst[i] += ':0';
			}

			// Broadcast event to relay stream
			data.dst = body.dst[i];
			emitTo(data.dst, 'event: signal\r\ndata: '+JSON.stringify(data)+'\r\n\r\n');
			successes++;
		}

		// Send response
		res.send((successes > 0) ? 204 : 404);
	});

	// Stream Helpers
	// ==============
	function emitTo(peerUri, msg) {
		var stream = _online_relays[peerUri];
		if (!stream) {
			return false;
		}
		stream.write(msg);
		return true;
	}

	function addUser(session, cb) {
		// Load user record
		db.getUser(session.user_id, function(err, user) {
			if (err || !user) {
				winston.error('Failed to load user from DB', { error: err, inputs: [session.user_id], session: session });
				return cb(err || true);
			}

			// Add to memory
			_online_users[session.user_id] = createOnlineUser(user, session);
			cb(null, _online_users[session.user_id]);
		});
	}

	function addStream(stream, cb) {
		var app = stream.locals.session.app || config.hostname;

		// Track the new stream
		_online_relays[stream.locals.peerUri] = stream;
		stream.on('close', onResStreamClosed);

		// Update user/app presence
		var user = _online_users[stream.locals.session.user_id];
		if (!user) {
			addUser(stream.locals.session, cb);
		} else {
			cb(null, user);
		}
	}

	function addUserLinks(user, stream, links) {
		// Add attributes
		links.forEach(function(link) {
			var host = extractHost(link.href);
			if (!host) // woah
				return; // err
			var peerd = peerUriRE.exec(host);
			if (peerd) {
				link.user   = peerd[1];
				link.app    = peerd[3];
				link.stream = peerd[4] || 0;
			}
		});

		// Add links
		user.links = user.links.concat(links);
	}

	function removeUserLinks(user, stream) {
		user.links = user.links.filter(function(link) {
			return !(link.stream == stream.locals.streamId && link.app == stream.locals.app);
		});
	}

	function extractHost(url) {
		var a = url.indexOf('://');
		if (a !== -1)
			url = url.slice(a+3);
		var b = url.indexOf('/');
		if (b !== -1)
			url = url.slice(0,b);
		return url;
	}

	function serializeLinkObject(link) {
		var linkParts = ['<'+link.href+'>'];
		for (var attr in link) {
			if (attr == 'href') {
				continue;
			}
			if (typeof link[attr] == 'boolean') {
				linkParts.push(attr);
			} else {
				linkParts.push(attr+'="'+link[attr]+'"');
			}
		}
		return linkParts.join('; ');
	}

	// - handles stream close by client
	function onResStreamClosed() {
		var stream   = this;
		var app      = stream.locals.app;
		var streamId = stream.locals.streamId;
		var peerUri  = stream.locals.peerUri;

		// Clear connection
		stream.removeAllListeners('close');

		// Remove from relays
		delete _online_relays[peerUri];

		// Update user/app presence
		var user = _online_users[stream.locals.session.user_id];
		if (user) {
			removeUserLinks(user, stream);

			// Remove user if there are no active links
			if (user.links.length === 0) {
				delete _online_users[user.id];
			}
		}
	}

	return server;
};