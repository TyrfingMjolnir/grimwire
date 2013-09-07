var express = require('express');
var middleware = require('../lib/middleware.js');

// Users
// =====
module.exports = function(db) {

	// Server State
	// ============
	var server = express();
	// Active relays
	// - maps "{username}-{app_domain}" -> http.ServerResponse
	var _online_relays = {};
	// Active users
	// - maps username -> [{apps:["foo.com",...]}, ...]
	var _online_users = {};

	// Routes
	// ======

	// Middleware
	// ----------
	server.all('*', middleware.authenticate(db));

	// Linking
	// -------
	server.all('/', function (req, res, next) {
		// Set links
		res.setHeader('Link', [
			'</>; rel="up via service grimwire.com/-p2pw/service"; title="Grimwire.net P2PW"',
			'</u{?online}>; rel="self collection grimwire.com/-p2pw/relay grimwire.com/-user"; id="users"',
			'</u/{id}>; rel="item grimwire.com/-p2pw/relay grimwire.com/-user"'
		].join(', '));
		next();
	});
	server.all('/:userId', function (req, res, next) {
		// Set links
		var userId = req.params.userId;
		res.setHeader('Link', [
			'</>; rel="via service grimwire.com/-service"; title="Grimwire.net P2PW"',
			'</u{?online}>; rel="up collection grimwire.com/-user"; id="users"',
			'</u/'+req.params.userId+'>; rel="self item grimwire.com/-p2pw/relay grimwire.com/-user"; id="'+userId+'"'
		].join(', '));
		next();
	});

	// Get users
	// ---------
	server.head('/', function(req, res) { return res.send(204); });
	server.get('/', function(req, res) {
		// Content-negotiation
		if (!req.accepts('json')) {
			return res.send(406);
		}

		// Give in-memory online users if requested
		if (req.query.online) {
			return res.json({ rows: Object.keys(_online_users) });
		}

		// Load full list from DB
		db.getUsers(function(err, dbres) {
			if (err) {
				console.error('Failed to load users from DB', err);
				return res.send(500);
			}

			// Extract ids
			var users = [];
			for (var i=0; i < dbres.rows.length; i++) {
				users.push(dbres.rows[i].id);
			}

			// Send response
			res.json({ rows: users });
		});
	});

	// Get user info or relay stream
	// -----------------------------
	server.head('/:userId', function(req, res) { return res.send(204); });
	server.get('/:userId', function(req, res, next) {
		var session = res.locals.session;

		// JSON request
		if (req.accepts('json')) {
			// Get user
			var user = _online_users[req.params.userId];
			if (!user) {
				return res.send(404);
			}

			// Check permissions
			if (!sessionIsTrusted(res.locals.session, user)) {
				return res.send(403);
			}

			// Send response
			return res.json({ item: user });
		}

		// Stream request
		if (req.accepts('text/event-stream')) {
			// Only allow users to subscribe to their own relays
			if (req.params.userId != session.user_id) {
				return res.send(403);
			}

			// Store params in response stream
			res.locals.relayId = req.params.userId+'-'+session.app;
			res.locals.userId  = req.params.userId;
			res.locals.app     = session.app;

			// Store connection
			return addStream(res, function(err) {
				if (err) {
					return res.send(500);
				}

				// Send back stream header
				res.writeHead(200, 'ok', {
					'content-type': 'text/event-stream',
					'cache-control': 'no-cache',
					'connection': 'keepalive'
				});
			});
		}

		// Not acceptable
		return res.send(406);
	});

	// Broadcast to a relay
	// --------------------
	server.post('/:userId', function (req, res, next) {
		var session = res.locals.session;
		// Content negotiation
		if (!req.is('json')) {
			return res.send(415);
		}

		// Only allow users to broadcast via their own relays
		if (req.params.userId != session.user_id) {
			return res.send(403);
		}

		// Validate message
		var body = req.body;
		if (!body || !body.msg || !body.dst || !body.dst.user || !body.dst.app) {
			return res.send(422);
		}

		// Make sure the target relay is online
		var relayId = body.dst.user+'-'+body.dst.app;
		if (!(relayId in _online_relays)) {
			return res.send(504);
		}

		// Check permissions
		var user = _online_users[body.dst.user];
		if (!sessionIsTrusted(res.locals.session, user)) {
			return res.send(403);
		}

		// Broadcast event to the stream owner
		var data = {
			src: { app: session.app, user: session.user_id },
			dst: body.dst,
			msg: body.msg
		};
		msg = 'event: signal\r\n';
		msg += 'data: '+JSON.stringify(data)+'\r\n';
		emitTo(relayId, msg+'\r\n');

		// Send response
		res.send(204);
	});


	// Business Logic
	// ==============
	function sessionIsTrusted(session, user) {
		return (user && (user.id == session.user_id || user.trusted_peers.indexOf(session.user_id) !== -1));
	}


	// Stream Helpers
	// ==============
	function emitTo(relayId, msg) {
		var relay = _online_relays[relayId];
		if (!relay || !relay.resStream) {
			return false;
		}
		relay.resStream.write(msg);
		return true;
	}

	function addUser(session, cb) {
		// Load user record
		db.getUser(session.user_id, function(err, dbres) {
			if (err || !dbres) {
				console.error('Failed to load user from DB', err);
				return cb(err);
			}

			// Add to memory
			_online_users[session.user_id] = {
				id: session.user_id,
				apps: [session.app],
				trusted_peers: dbres.rows[0].trusted_peers
			};
			cb(null, _online_users[session.user_id]);
		});
	}

	function addStream(res, cb) {
		// Create the relay if DNE
		var relayId = res.locals.relayId;
		var relay = _online_relays[relayId];
		if (!relay) {
			relay = _online_relays[relayId] = {
				id: relayId,
				app: res.locals.app,
				user: res.locals.userId,
				resStream: null
			};
		}

		// Close the existing stream
		if (relay.resStream) {
			relay.resStream.removeAllListeners('close');
			relay.resStream.end();
		}

		// Track the new stream
		relay.resStream = res;
		res.on('close', onResStreamClosed);

		// Update user/app presence
		var user = _online_users[res.locals.session.user_id];
		if (!user) {
			addUser(res.locals.session, cb);
		} else {
			user.apps.push(res.locals.session.app);
			cb(null, user);
		}
	}

	// - handles stream close by client
	function onResStreamClosed() {
		var res     = this;
		var relayId = res.locals.relayId;
		var relay   = _online_relays[relayId];

		// Clear connection
		res.removeAllListeners('close');

		// Remove relay
		delete _online_relays[relayId];

		// Update user/app presence
		var user = _online_users[res.locals.session.user_id];
		if (user) {
			user.apps = user.apps.filter(function(app) { return app != res.locals.session.app; });
			if (user.apps.length === 0) {
				delete _online_users[res.locals.session.user_id];
			}
		}
	}

	return server;
};