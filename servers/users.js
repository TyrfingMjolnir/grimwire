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
			'</>; rel="up via service grimwire.com/-service"; title="Grimwire.net P2PW"',
			'</u{?online}>; rel="self collection grimwire.com/-users"; id="users"',
			'</u/{id}>; rel="item grimwire.com/-user"'
		].join(', '));
		next();
	});
	server.all('/:userId', function (req, res, next) {
		// Set links
		var userId = req.params.userId;
		res.setHeader('Link', [
			'</>; rel="via service grimwire.com/-service"; title="Grimwire.net P2PW"',
			'</u{?online}>; rel="up collection grimwire.com/-users"; id="users"',
			'</u/'+req.params.userId+'>; rel="self item grimwire.com/-user"; id="'+userId+'"',
			'</u/'+userId+'/auth/{id}>; rel="service grimwire.com/-access-token"',
			'</u/'+userId+'/relays>; rel="service collection grimwire.com/-relays"; id="relays"'
		].join(', '));
		next();
	});
	server.all('/:userId/auth/:app', function (req, res, next) {
		// Set links
		var userId = req.params.userId;
		var app    = req.params.app;
		res.setHeader('Link', [
			'</>; rel="via service grimwire.com/-service"; title="Grimwire.net P2PW"',
			'</u/'+userId+'>; rel="up item grimwire.com/-user"; id="'+userId+'"',
			'</u/'+userId+'/auth/'+app+'>; rel="self service grimwire.com/-access-token"; id="'+app+'"'
		].join(', '));
		next();
	});
	server.all('/:userId/relays', function (req, res, next) {
		// Set links
		var userId = req.params.userId;
		res.setHeader('Link', [
			'</>; rel="via service grimwire.com/-service"; title="Grimwire.net P2PW"',
			'</u/'+userId+'>; rel="up item grimwire.com/-user"; id="'+userId+'"',
			'</u/'+userId+'/relays>; rel="self service collection grimwire.com/-relays"; id="relays"',
			'</u/'+userId+'/relays/{id}>; rel="item grimwire.com/-relay"'
		].join(', '));
		next();
	});
	server.all('/:userId/relays/:app', function (req, res, next) {
		// Set links
		var userId = req.params.userId;
		var app    = req.params.app;
		res.setHeader('Link', [
			'</>; rel="via service grimwire.com/-service"; title="Grimwire.net P2PW"',
			'</u/'+userId+'/relays>; rel="up service collection grimwire.com/-relays"; id="relays"',
			'</u/'+userId+'/relays/'+app+'>; rel="item grimwire.com/-relay"'
		].join(', '));
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

	// Get user
	// --------
	server.head('/:userId', function(req, res) { return res.send(204); });
	server.get('/:userId', getOnlineUser, checkSessionTrust, function(req, res, next) {
		// Content-negotiation
		if (!req.accepts('json')) {
			return res.send(406);
		}

		// Send response
		return res.json({ item: res.locals.user });
	});

	// Get app access-token interface
	// ------------------------------
	server.head('/:userId/auth/:app', function(req, res) { return res.send(204); });
	server.all('/:userId/auth/:app', function(req, res, next) {
		// Only provide for session user
		if (res.locals.session.user_id != req.params.userId) {
			return res.send(403);
		}
		// Don't provide for 3rd party apps (must access directly)
		if (res.locals.session.app) {
			return res.send(403);
		}
		next();
	});
	server.get('/:userId/auth/:app', function(req, res) {
		// Content negotiation
		if (!req.accepts('html')) {
			return res.send(406);
		}

		// Generate html
		var html = require('fs').readFileSync('./static/app-auth.html').toString();
		html = html.replace(/\{APP_DOMAIN\}/g, req.params.app);
		html = html.replace(/\{SESSION_USER\}/g, res.locals.session.user_id);

		// Serve
		res.send(html);
	});
	server.post('/:userId/auth/:app', function(req, res) {
		// Generate access token
		db.createSession(res.locals.session.user_id, req.params.app, function(err, dbres) {
			if (err || !dbres.rows[0]) {
				console.error('Failed to create app session in DB', err);
				return res.send(500);
			}

			// Respond
			res.send({ token: dbres.rows[0].id });
		});
	});

	// Get user's online relays
	// ------------------------
	server.head('/:userId/relays', function(req, res) { return res.send(204); });
	server.get('/:userId/relays', getOnlineUser, checkSessionTrust, function(req, res, next) {
		// Content-negotiation
		if (!req.accepts('json')) {
			return res.send(406);
		}

		// Respond with user's active apps
		res.json({ rows: res.locals.user.apps });
	});

	// Get online relay stream & info
	// ------------------------------
	server.head('/:userId/relays/:app', function(req, res) { return res.send(204); });
	server.get('/:userId/relays/:app', function(req, res, next) {
		var session = res.locals.session;
		var user = res.locals.user;

		// Content negotiation
		if (!req.accepts('text/event-stream')) {
			return res.send(406);
		}

		// Only allow <user,app>s to subscribe to their own relays
		if (req.params.userId != session.user_id || req.params.app == session.app) {
			return res.send(403);
		}

		// Store params in response stream
		res.locals.relayId = req.params.userId+'-'+req.params.app;
		res.locals.userId  = req.params.userId;
		res.locals.app     = req.params.app;

		// Store connection
		addStream(res);

		// Send back stream header
		res.writeHead(200, 'ok', {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			'connection': 'keepalive'
		});
	});

	// Broadcast to a relay
	// --------------------
	server.post('/:userId/relays/:app', getOnlineUser, checkSessionTrust, function (req, res, next) {
		// Content negotiation
		if (!req.is('json')) {
			return res.send(415);
		}

		// Broadcast event to the stream owner
		var session = res.locals.session;
		var data = {
			from: { app: session.app, user: session.user_id },
			msg: (req.body) ? req.body : null
		};
		msg = 'event: post\r\n';
		msg += 'data: '+JSON.stringify(data)+'\r\n';
		emitTo(relayId, msg+'\r\n');

		// Send response
		res.send(204);
	});


	// Route Helpers
	// =============
	function getOnlineUser(req, res, next) {
		// Get user
		res.locals.user = _online_users[req.params.userId];
		if (!res.locals.user) {
			return res.send(404);
		}
		next();
	}
	function checkSessionTrust(req, res, next) {
		// Does the session have permission to interact?
		if (sessionIsTrusted(res.locals.session, res.locals.user)) {
			return res.send(403);
		}
		next();
	}


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

	function addStream(res) {
		// Create the relay if DNE
		var relayId = res.locals.relayId;
		var relay = _active_relays[relayId];
		if (!relay) {
			relay = _active_relays[relayId] = {
				id: relayId,
				app: res.locals.app,
				user: res.locals.userId,
				resStream: null
			};
		}

		// Close the existing stream
		if (relay.resStream) {
			relay.resStream.removeAllListeners('close');
			relay.resStream.close();
		}

		// Track the new stream
		relay.resStream = res;
		res.on('close', onResStreamClosed);

		// Update user/app presence
		var user = _online_users[res.locals.session.user_id];
		if (!user) {
			user = _online_users[res.locals.session.user_id] = {
				id: res.locals.session.user_id,
				apps: [res.locals.session.app],
				trusted_peers: [] // :TODO:
			};
		} else {
			user.apps.push(res.locals.session.app);
		}
	}

	// - handles stream close by client
	function onResStreamClosed() {
		var res     = this;
		var relayId = res.locals.relayId;
		var relay   = _active_relays[relayId];

		// Clear connection
		res.removeAllListeners('close');

		// Remove relay
		delete _active_relays[relayId];

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