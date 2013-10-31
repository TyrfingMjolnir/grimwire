var express = require('express');
var middleware = require('../middleware.js');
var util = require('../util.js');
var html = require('../html.js');
var bcrypt = require('bcrypt');
var winston = require('winston');

// Session
// =======
module.exports = function(config, db) {
	var server = express();

	// Routes
	// ======

	// Linking
	// -------
	server.all('/', function (req, res, next) {
		// Set links
		res.setHeader('Link', [
			'</>; rel="up via service gwr.io/relay"; title="Grimwire.net P2PW"',
			'</session>; rel="self service gwr.io/session"; id="user"',
			'</session/{app}>; rel="service gwr.io/session"; id="app"'
		].join(', '));
		next();
	});
	server.all('/:app', function (req, res, next) {
		// Set links
		var app = req.params.app;
		res.setHeader('Link', [
			'</>; rel="service via gwr.io/relay"; title="Grimwire.net P2PW"',
			'</session>; rel="up service gwr.io/session"; id="user"',
			'</session/'+app+'>; rel="self service gwr.io/session"; id="app"'
		].join(', '));
		next();
	});

	// Get session info
	// ----------------
	server.head('/', function(req, res) { return res.send(204); });
	server.get('/', getSession, function(req, res, next) {
		if (!req.accepts('json')) {
			return res.send(406);
		}
		// Send response
		res.json({
			user_id: res.locals.session.user_id,
			avatar: res.locals.session.avatar
		});
	});

	// Start a new session
	// -------------------
	server.post('/',
		function (req, res, next) {
			// Validate inputs
			var errors = validateSessionCreate(req.body);
			if (errors) {
				res.writeHead(422, 'bad entity', {'Content-Type': 'application/json'});
				res.end(JSON.stringify(errors));
				return;
			}

			// Fetch the user
			db.getUser(req.body.id, function(err, user) {
				if (err || !user) {
					res.writeHead(422, 'bad entity', {'Content-Type': 'application/json'});
					res.end(JSON.stringify({errors:['Invalid username or password.']}));
					return;
				}
				res.locals.user = user;
				next();
			});
		},
		function (req, res, next) {
			// Check password
			checkPassword(req.body.password, res.locals.user.password, function(err) {
				if (err) {
					res.writeHead(422, 'bad entity', {'Content-Type': 'application/json'});
					res.end(JSON.stringify({errors:['Invalid username or password.']}));
					return;
				}
				next();
			});
		},
		function (req, res, next) {
			// Create the session
			db.createSession(req.body.id, null, function(err, sessionId) {
				if (err) {
					winston.error('Failed to create session info in DB', { error: err, inputs: [req.body.id], request: util.formatReqForLog(req) });
					res.send(500);
					return;
				}

				// Set new session cookie
				req.session = sessionId;
				res.send(204);
			});
		}
	);

	// End session
	// -----------
	server.delete('/', getSession, function(req, res) {
		// Stop now if no session exists
		if (!res.locals.session) {
			return res.send(204);
		}
		// Clear session records
		db.deleteUserSessions(res.locals.session.user_id, function(err) {
			if (err) {
				winston.error('Failed to delete sessions from DB', { error: err, inputs: [res.locals.session.user_id], request: util.formatReqForLog(req) });
				return res.send(500);
			}

			// Remove the session cookie
			req.session = null;
			res.send(204);
		});
	});

	// Get app access-token interface
	// ------------------------------
	server.head('/:app', function(req, res) { return res.send(204); });
	server.all('/:app', middleware.authenticate(config, db), function(req, res, next) {
		// Don't provide for 3rd party apps (must access directly)
		if (res.locals.session.app) {
			return res.send(403);
		}
		next();
	});
	server.get('/:app', function(req, res) {
		// Content negotiation
		if (!req.accepts('html')) {
			return res.send(406);
		}

		// Generate html
		var auth_html = html.app_auth;
		auth_html = auth_html.replace(/\{APP_DOMAIN\}/g, req.params.app);
		auth_html = auth_html.replace(/\{SESSION_USER\}/g, res.locals.session.user_id);

		// Serve
		res.send(auth_html);
	});

	// Create access-token
	// -------------------
	server.post('/:app', function(req, res) {
		// Generate access token
		db.createSession(res.locals.session.user_id, req.params.app, function(err, sessionId) {
			if (err) {
				winston.error('Failed to create app session in DB', { error: err, inputs: [res.locals.session.user_id, req.params.app], request: util.formatReqForLog(req) });
				return res.send(500);
			}

			// Respond
			res.send({ token: res.locals.session.user_id + ':' + sessionId });
		});
	});


	// Business Logic
	// ==============
	function validateSessionCreate(body) {
		if (!body) {
			return { errors: ['Body is required.'] };
		}
		var errors = [];
		if (body.id && typeof body.id != 'string') {
			errors.push('`id` must be a string');
		}
		if (body.password && typeof body.password != 'string') {
			errors.push('`password` must be a string');
		}
		if (errors.length > 0) {
			return { errors: errors };
		}
		return false;
	}
	function checkPassword(plaintext, encrypted, cb) {
		bcrypt.compare(plaintext, encrypted, function(err, success) {
			cb(!success);
		});
	}


	// Middleware
	// ==========
	function getSession(req, res, next) {
		// Load session from DB
		db.getSession(req.session, function(err, session) {
			if (err) {
				winston.error('Failed to get session info from DB', { error: err, inputs: [req.session], request: util.formatReqForLog(req) });
				res.send(500);
				return;
			}
			res.locals.session = session;
			next();
		});
	}

	return server;
};