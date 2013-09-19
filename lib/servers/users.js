var express = require('express');
var middleware = require('../middleware.js');
var util = require('../util.js');
var bcrypt = require('bcrypt');
var winston = require('winston');

// Setup email (temporary)
var smtpTransport = require('../../mail-cfg.js');


// Users
// =====
module.exports = function(config, db) {

	// Server State
	// ============
	var server = express();
	// Active relays
	// - maps "{username}-{app_domain}-{stream_id}" -> http.ServerResponse
	var _online_relays = {};
	// Active users
	// - maps username -> [{streams:{"foo.com":[123,124],...}, ...]
	var _online_users = {};

	function createRelayId(user, app, stream) {
		return user+'-'+app+'-'+stream;
	}
	function createOnlineUser(userRecord, session) {
		return {
			id: session.user_id,
			streams: {}
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
	server.get('/', middleware.authenticate(db));
	server.all('/:userId', middleware.authenticate(db));

	// Linking
	// -------
	server.all('/', function (req, res, next) {
		// Set links
		res.setHeader('Link', [
			'</>; rel="up via service grimwire.com/-p2pw/service"; title="Grimwire.net P2PW"',
			'</u{?online}>; rel="self collection grimwire.com/-p2pw/relay grimwire.com/-user"; id="users"',
			'</u/{id}{?stream,nc}>; rel="item grimwire.com/-p2pw/relay grimwire.com/-user"'
		].join(', '));
		next();
	});
	server.all('/:userId', function (req, res, next) {
		// Set links
		var userId = req.params.userId;
		res.setHeader('Link', [
			'</>; rel="via service grimwire.com/-service"; title="Grimwire.net P2PW"',
			'</u{?online}>; rel="up collection grimwire.com/-user"; id="users"',
			'</u/'+userId+'{?stream,nc}>; rel="self item grimwire.com/-p2pw/relay grimwire.com/-user"; id="'+userId+'"'
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

			// Give in-memory online users if requested
			if (req.query.online) {
				res.locals.users = _online_users;
				return next();
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
			var rows = [], users = res.locals.users;
			var sessionUserId = res.locals.session.user_id;
			var emptyObj = {};
			for (var k in users) {
				var user = users[k];
				// Get user's online status
				var onlineUser = _online_users[user.id];
				// Add row
				rows.push({
					id: user.id,
					online: !!onlineUser,
					streams: (onlineUser) ? onlineUser.streams : {},
					created_at: user.created_at
				});
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
			res.writeHead(422, 'bad ent - must include `id` and `password`');
			return res.end();
		}
		if (typeof body.id != 'string' || typeof body.password != 'string') {
			res.writeHead(422, 'bad ent - `id` and `password` must be strings');
			return res.end();
		}
		if (!/^[-a-z0-9_]+$/i.test(body.id)) {
			res.writeHead(422, 'bad ent - `id` must pass /^[-a-z0-9_]+$/i');
			return res.end();
		}
		if (body.email && typeof body.email != 'string') {
			res.writeHead(422, 'bad ent - (when included) `email` must be a string');
			return res.end();
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

					// Send an alert email
					smtpTransport.sendMail({
						from:    "pfrazee@gmail.com",
						to:      "pfrazee@gmail.com",
						subject: "New user on grimwire: "+body.id,
						text:    "New user created\n"+(new Date())+"\n"+body.email
					}, function(err, response) {
						if (err) {
							winston.error('Failed to send new user notification', { error: err, response: response });
						}
					});

					// Send response
					res.send(204);
				});
			});
		});
	});

	// Get user info or relay stream
	// -----------------------------
	server.head('/:userId', function(req, res) { return res.send(204); });
	server.get('/:userId', function(req, res, next) {
		// Content negotiation
		if (!req.accepts('json')) {
			return res.send(406);
		}

		// :TODO: get user when offline

		// Get user
		var user = _online_users[req.params.userId];
		if (!user) {
			return res.send(404);
		}

		// Send response
		return res.json({ item: user });
	});

	// Subscribe to stream
	// -------------------
	server.subscribe('/:userId', function(req, res) {
		var session = res.locals.session;

		// Content negotiation
		if (!req.accepts('text/event-stream')) {
			return res.send(406);
		}

		// Only allow users to subscribe to their own relays
		if (req.params.userId != session.user_id) {
			return res.send(403);
		}

		// Store params in response stream
		res.locals.userId   = req.params.userId;
		res.locals.app      = session.app;
		res.locals.streamId = req.query.stream || 0;
		res.locals.relayId  = createRelayId(res.locals.userId, res.locals.app, res.locals.streamId);

		// Check stream availability
		if ((res.locals.relayId in _online_relays)) {
			return res.send(423);
		}

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
			res.write('\n'); // Writing to the stream lets the client know its open
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
		// :TODO: email
		// if (req.body.trusted_peers) {
		// 	if (!Array.isArray(req.body.trusted_peers) || req.body.trusted_peers.filter(function(v) { return typeof v == 'string'; }).length !== req.body.trusted_peers.length) {
		// 		return res.send(422, { error: '`trusted_peers` must be an array of strings.'});
		// 	}
		// 	updates.trusted_peers = req.body.trusted_peers;
		// }
		// ^ old, just here for reference in the future
		if (Object.keys(updates).length === 0) {
			return res.send(422, { error: 'No valid fields in the request body.' });
		}

		// Update online user
		var user = _online_users[req.params.userId];
		if (user) {
			// user.trusted_peers = updates.trusted_peers;
			// ^ old, just here for reference in the future
		}

		// Update DB
		db.updateUser(req.params.userId, updates, function(err) {
			if (err) {
				winston.error('Failed to update user in DB', { error: err, inputs: [req.params.userId], request: util.formatReqForLog(req) });
				return res.send(500);
			}

			// Send response
			res.send(204);
		});
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
		if (!body || !body.msg || !body.dst || !body.src) {
			return res.send(422, { error: 'Request body must include `msg`, `dst`, and `src`.' });
		}
		body.src.stream = +body.src.stream;
		if (typeof body.src.user != 'string' || typeof body.src.app != 'string' || isNaN(body.src.stream)) {
			return res.send(422, { error: '`src` must include `user` (string), `app` (string), and `stream` (number).' });
		}
		if (body.src.user != session.user_id || body.src.app != session.app) {
			return res.send(422, { error: '`src.user` and `src.app` must match the sending application (your session shows '+session.user_id+' and '+session.app+')' });
		}

		// Iterate destinations
		var relayId, data = { dst: null, src: body.src, msg: body.msg };
		if (!Array.isArray(body.dst)) { body.dst = [body.dst]; }
		for (var i=0; i < body.dst.length; i++) {
			// Validate
			body.dst[i].stream = +body.dst[i].stream;
			if (typeof body.dst[i].user != 'string' || typeof body.dst[i].app != 'string' || isNaN(body.dst[i].stream)) {
				return res.send(422, { error: '`dst` objects must include `user` (string), `app` (string), and `stream` (number).' });
			}

			// Make sure the target relay is online
			relayId = createRelayId(body.dst[i].user, body.dst[i].app, body.dst[i].stream);
			if (!(relayId in _online_relays)) {
				continue;
			}

			// Broadcast event to relay stream
			data.dst = body.dst[i];
			emitTo(relayId, 'event: signal\r\ndata: '+JSON.stringify(data)+'\r\n\r\n');
		}

		// Send response
		res.send(204);
	});


	// Stream Helpers
	// ==============
	function emitTo(relayId, msg) {
		var stream = _online_relays[relayId];
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

	function addStream(res, cb) {
		var app = res.locals.session.app;

		// Track the new stream
		_online_relays[res.locals.relayId] = res;
		res.on('close', onResStreamClosed);

		// Update user/app presence
		var user = _online_users[res.locals.session.user_id];
		if (!user) {
			addUser(res.locals.session, function(err, user) {
				if (err) { return cb(err); }
				if (!user.streams[app]) { user.streams[app] = []; }
				user.streams[app].push(res.locals.streamId);
				cb(null, user);
			});
		} else {
			if (!user.streams[app]) { user.streams[app] = []; }
			user.streams[app].push(res.locals.streamId);
			cb(null, user);
		}
	}

	// - handles stream close by client
	function onResStreamClosed() {
		var res      = this;
		var app      = res.locals.app;
		var streamId = res.locals.streamId;
		var relayId  = res.locals.relayId;

		// Clear connection
		res.removeAllListeners('close');

		// Remove from relays
		delete _online_relays[relayId];

		// Update user/app presence
		var user = _online_users[res.locals.session.user_id];
		if (user && user.streams[app]) {
			user.streams[app] = user.streams[app].filter(function(sid) { return sid != streamId; });
			// Remove app from streams of empty
			if (user.streams[app].length === 0) {
				delete user.streams[app];
			}
			// Remove user if there are no active streams
			if (Object.keys(user.streams).length === 0) {
				delete _online_users[res.locals.session.user_id];
			}
		}
	}

	return server;
};