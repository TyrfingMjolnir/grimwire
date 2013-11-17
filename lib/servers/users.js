var express = require('express');
var middleware = require('../middleware.js');
var util = require('../util.js');
var bcrypt = require('bcrypt');
var winston = require('winston');

// Users
// =====
module.exports = function() {
	var config = require('../config');
	var db = require('../db');
	var sessions = require('../sessions');
	var streams = require('../streams');

	// Server State
	// ============
	var server = express();

	// For use in /status
	server.getStatus = function(user) {
		var status = { you: streams.online_users[user.id] || 'no active streams' };
		if (user.is_admin) {
			status.num_streams = Object.keys(streams.online_streams).length;
			status.stream_uris = Object.keys(streams.online_streams);
			status.num_online_users = Object.keys(streams.online_users).length;
			status.online_user_names = Object.keys(streams.online_users);
			status.online_users = streams.online_users;
		}
		return status;
	};

	// Routes
	// ======

	// Middleware
	// ----------
	server.get('/', middleware.authenticate);
	server.all('/:userId', middleware.authenticate);
	server.all('/:userId/s/:appDomain/:streamId', middleware.authenticate);

	// Linking
	// -------
	server.all('/', function (req, res, next) {
		// Set links
		var links = [
			'</>; rel="up via service gwr.io/relay/service gwr.io/user/service"; title="Grimwire Relay"',
			'</u{?online,links}>; rel="self collection gwr.io/relay/coll gwr.io/user/coll"; id="users"',
			'</u/{id}>; rel="item gwr.io/user/item"',
			'</u/{user}/s/{app}/{stream}{?nc}>; rel="item gwr.io/relay/item"'
		];
		if (req.query.links) {
			// Add all online links
			for (var id in streams.online_users) {
				links = links.concat(streams.online_users[id].links.map(serializeLinkObject));
			}
		}
		res.setHeader('Link', links.join(', '));
		next();
	});
	server.all('/:userId', function (req, res, next) {
		// Set links
		var userId = req.params.userId;
		res.setHeader('Link', [
			'</>; rel="via service gwr.io/relay/service gwr.io/user/service"; title="Grimwire Relay"',
			'</u{?online,links}>; rel="up collection gwr.io/relay/coll gwr.io/user/coll"; id="users"',
			'</u/'+userId+'>; rel="self item gwr.io/user/item"; id="'+userId+'"',
			'</u/'+userId+'/s/{app}/{stream}{?nc}>; rel="gwr.io/relay/item"'
		].join(', '));
		next();
	});
	server.all('/:userId/s/:appDomain/:streamId', function(req, res, next) {
		// Set links
		var userId = req.params.userId;
		var appDomain = req.params.appDomain;
		var streamId = req.params.streamId;
		res.setHeader('Link', [
			'</>; rel="via service gwr.io/relay/service gwr.io/user/service"; title="Grimwire Relay"',
			'</u{?online,links}>; rel="up collection gwr.io/relay/coll gwr.io/user/coll"; id="users"',
			'</u/'+userId+'>; rel="gwr.io/user/item"; id="'+userId+'"',
			'</u/'+userId+'/s/'+appDomain+'/'+streamId+'{?nc}>; rel="self item gwr.io/relay/item"'
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
				var onlineUser = streams.online_users[user.id];
				// Filter by online, if requested
				if (req.query.online && !onlineUser) {
					continue;
				}
				// Add row
				rows[user.id] = {
					id: user.id,
					guestof: false,
					online: !!(onlineUser && onlineUser.streams.length),
					avatar: user.avatar,
					created_at: user.created_at
				};
				// Add session-user data
				if (user.id == sessionUserId) {
					onlineUser = onlineUser || {};
					rows[user.id].num_user_streams = onlineUser.num_user_streams || 0;
					rows[user.id].max_user_streams = onlineUser.max_user_streams || user.max_user_streams || config.max_user_streams;
					rows[user.id].num_guest_streams = onlineUser.num_guest_streams || 0;
					rows[user.id].max_guest_streams = onlineUser.max_guest_streams || user.max_guest_streams || 0;
				}
			}
			for (var k in streams.guest_users) {
				var user = streams.guest_users[k];
				// Add row
				rows[user.id] = {
					id: user.id,
					guestof: user.guestof,
					online: !!(user.streams.length),
					avatar: 'user.png',
					created_at: user.created_at
				};
				// Add session-user data
				if (user.id == sessionUserId) {
					rows[user.id].num_user_streams = user.num_user_streams || 0;
				}
			}

			// Send response
			return res.json({ rows: rows });
		}
	);

	// Create user
	// -----------
	server.post('/', function (req, res, next) {
		// Is enabled?
		if (!config.allow_signup) {
			return res.send(405);
		}

		// Hit users limit?
		db.countUsers(function(err, numUsers) {
			if (err) {
				winston.error('Failed to count users', { error: err, request: util.formatReqForLog(req) });
				return res.send(500);
			}
			if (numUsers >= config.max_accounts) {
				res.writeHead(507, 'User limit reached on relay.');
				res.end();
				return;
			}
			next();
		});
	});
	server.post('/', function (req, res, next) {
		var session = res.locals.session;

		// Content negotiation
		if (!req.is('json')) {
			return res.send(415);
		}

		// Validate body
		var body = req.body, errors = {};
		if (!body) { return res.send(422, {errors:{_form:'Must provide a username and password.'}}); }
		if (!body.id) { errors.id = 'Required.'; }
		else if (typeof body.id != 'string') { errors.id = 'Must be a string.'; }
		else if (!/^[a-z0-9_]+$/i.test(body.id)) { errors.id = 'Must only contain letters, numbers, and underscores.'; }
		else if (body.id.length > 64) { errors.id = 'Must be 64 characters or less.'; }
		if (!body.password) { errors.password = 'Required.'; }
		else if (typeof body.password != 'string') { errors.password = 'Must be a string.'; }
		else if (body.password.length > 256) { errors.password = 'Must be 256 characters or less.'; }
		if (body.email) {
			if (typeof body.email != 'string') { errors.email = 'Must be a string.'; }
			else if (body.email.length > 512) { errors.email = 'Must be 512 characters or less.'; }
		}
		if (body.avatar) {
			if (typeof body.avatar != 'string') { errors.avatar = 'Must be a string.'; }
			else if (body.avatar.length > 256) { errors.avatar = 'Must be 256 characters or less.'; }
		}
		if (typeof body.max_guest_streams != 'undefined') {
			if (isNaN(body.max_guest_streams)) { errors.max_guest_streams = 'Must be a number.'; }
		}
		if (Object.keys(errors).length) {
			return res.send(422, { errors: errors });
		}

		// Hash the password
		bcrypt.genSalt(10, function(err, salt) {
			bcrypt.hash(body.password, salt, function(err, hash) {
				if (err) {
					winston.error('Failed to encrypt user password.', { error: err, inputs: [body.password, salt], request: util.formatReqForLog(req) });
					return res.send(500);
				}
				body.password = hash;

				// Try to insert
				db.createUser(body, function(err) {
					if (err) {
						if (err.conflict) {
							return res.send(409);
						} else {
							winston.error('Failed to add user to database.', { error: err, inputs: [body], request: util.formatReqForLog(req) });
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
		var onlineUser = streams.online_users[req.params.userId];
		db.getUser(req.params.userId, function(err, user) {
			if (!user) {
				user = streams.guest_users[req.params.userId];
				if (!user) {
					return res.send(404);
				}
				onlineUser = user;
			}

			// Build user item
			var item = {
				id: user.id,
				guestof: (onlineUser) ? onlineUser.guestof : false,
				online: !!(onlineUser && onlineUser.streams.length),
				avatar: user.avatar || 'user.png',
				created_at: user.created_at
			};

			// Add session-user data
			if (user.id == res.locals.session.user_id) {
				onlineUser = streams.online_users || {};
				item.num_user_streams = onlineUser.num_user_streams || 0;
				item.max_user_streams = onlineUser.max_user_streams || user.max_user_streams || config.max_user_streams;
				item.num_guest_streams = onlineUser.num_guest_streams || 0;
				item.max_guest_streams = onlineUser.max_guest_streams || user.max_guest_streams || 0;
			}

			// Send response
			res.json({ item: item });
		});
	});

	// Update user/settings
	// --------------------
	server.patch('/:userId', function (req, res, next) {
		var session = res.locals.session;
		var onlineUser = streams.online_users[req.params.userId];

		// Content negotiation
		if (!req.is('json')) {
			return res.send(415);
		}

		// Only allow users to update their own accounts
		if (req.params.userId != session.user_id) {
			return res.send(403);
		}

		// Dont allow guets to make updates
		if (session.guestof) {
			return res.send(403);
		}

		// Validate message
		if (!req.body) {
			return res.send(422, {errors:{_form:'Request body is required.'}});
		}
		var updates = {}, errors = {};
		if (req.body.avatar) {
			if (typeof req.body.avatar != 'string') { errors.avatar = 'Must be a string.'; }
			else if (req.body.avatar.length > 256) { errors.avatar = 'Must be 256 characters or less.'; }
			else { updates.avatar = req.body.avatar; }
		}
		if (req.body.email) {
			if (typeof req.body.email != 'string') { errors.email = 'Must be a string.'; }
			else if (req.body.email.length > 512) { errors.email = 'Must be 512 characters or less.'; }
			else { updates.email = req.body.email; }
		}
		if (typeof req.body.max_guest_streams != 'undefined') {
			if (isNaN(req.body.max_guest_streams)) { errors.max_guest_streams = 'Must be a number.'; }
			else if (onlineUser && onlineUser.num_guest_streams > req.body.max_guest_streams) {
				errors.max_guest_streams = 'Can\'t set the max number of guest streams to be less than the current number of guests.';
			}
			else { updates.max_guest_streams = req.body.max_guest_streams; }
		}
		if (Object.keys(errors).length) { return res.send(422, { errors: errors }); }
		if (Object.keys(updates).length === 0) {
			return res.send(422, {errors:{_form:'No valid fields in the request body.'}});
		}

		// Update DB
		db.updateUser(req.params.userId, updates, function(err) {
			if (err) {
				if (err.notfound) { return res.send(404); }
				winston.error('Failed to update user in DB', { error: err, inputs: [req.params.userId], request: util.formatReqForLog(req) });
				return res.send(500);
			}
			sessions.updateSession(session.id, updates, function(err) {
				if (err && !err.notfound) {
					winston.error('Failed to update session in DB', { error: err, inputs: [req.params.userId], request: util.formatReqForLog(req) });
					return res.send(500);
				}

				// Update memory
				if (onlineUser) {
					onlineUser.max_guest_streams = req.body.max_guest_streams;
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
		var peerUri = streams.createPeerUri(req.params.userId, req.params.appDomain, req.params.streamId);
		var stream = streams.online_streams[peerUri];
		var user = streams.online_users[req.params.userId];
		if (!stream || !user) {
			return res.send(404);
		}

		// Extract links
		var links = user.links.filter(function(link) { return link.app == req.params.appDomain && link.stream == req.params.streamId; });

		// Send response
		return res.json({ links: links });
	});

	// Update Stream Info
	// ------------------
	server.patch('/:userId/s/:appDomain/:streamId', function(req, res, next) {
		var session = res.locals.session;
		var peerUri = streams.createPeerUri(req.params.userId, req.params.appDomain, req.params.streamId);

		// Fetch user & stream
		var stream = streams.online_streams[peerUri];
		var user = streams.online_users[req.params.userId];
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

		// Dont allow guests to update their streams
		if (session.guestof) {
			return res.send(403);
		}

		// Validate message
		if (!req.body) {
			return res.send(422, {errors:{_form:'Request body is required.'}});
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
					return res.send(422, {errors:{_form:'Link '+i+' did not parse into a link object'}});
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
			return res.send(422, {errors:{_form:'No valid fields in the request body.'}});
		}

		// Update stream
		if (updates.links) {
			streams.removeUserLinks(user, stream);
			streams.addUserLinks(user, stream, updates.links);
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
		res.locals.guestof  = session.guestof;
		res.locals.peerUri  = streams.createPeerUri(res.locals.userId, res.locals.app, res.locals.streamId);

		// Check stream availability
		if ((res.locals.peerUri in streams.online_streams)) {
			return res.send(423);
		}

		// Store connection
		streams.addStream(res, function(err, user) {
			if (err) {
				if (err.outOfStreams) {
					res.writeHead(420, 'Out of Resources');
					res.end();
					return;
				} else {
					return res.send(500);
				}
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
		var body = req.body, errors = {};
		if (!body) { return res.send(422, {errors:{_form:'Request body must include `msg`, `dst`, and `src`.'}}); }
		if (!body.msg) { errors.msg = 'Required.'; }
		if (!body.dst) { errors.dst = 'Required.'; }
		if (!body.src) { errors.src = 'Required.'; }
		else {
			var srcParsed = streams.peerUriRE.exec(body.src);
			if (!srcParsed) { errors.src = 'Not a valid peer domain: must conform to /^(.+)@([^!]+)!([^!\\/]+)(?:!([\\d]+))?$/i.'; }
			else if (srcParsed[1] != session.user_id || srcParsed[3] != session_app) {
				errors.src = 'Must match the sending application (your session shows '+session.user_id+' and '+session_app+')';
			}
		}
		if (Object.keys(errors).length) { return res.send(422, { errors: errors }); }

		// Iterate destinations
		var successes=0;
		var peerUri, data = { dst: null, src: body.src, msg: body.msg };
		if (!Array.isArray(body.dst)) { body.dst = [body.dst]; }
		for (var i=0; i < body.dst.length; i++) {
			// Make sure the target relay is online
			if (!(body.dst[i] in streams.online_streams)) {
				// Try default stream
				if (!(body.dst[i]+'!0' in streams.online_streams)) {
					continue;
				}
				body.dst[i] += '!0';
			}

			// Broadcast event to relay stream
			data.dst = body.dst[i];
			streams.emitTo(data.dst, 'event: signal\r\ndata: '+JSON.stringify(data)+'\r\n\r\n');
			successes++;
		}

		// Send response
		res.send((successes > 0) ? 204 : 404);
	});

	// Helpers
	// =======
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

	return server;
};