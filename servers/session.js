var express = require('express');
var middleware = require('../lib/middleware.js');

// Session
// =======
module.exports = function(db) {
	var server = express();

	// Routes
	// ======

	// Linking
	// -------
	server.all('/', function (req, res, next) {
		// Set links
		res.setHeader('Link', [
			'</>; rel="up service via grimwire.com/-p2pw/service"; title="Grimwire.net P2PW"',
			'</session>; rel="self service grimwire.com/-session"; id="session"',
			'</session/{app}>; rel="service grimwire.com/-access-token"'
		].join(', '));
		next();
	});
	server.all('/:app', function (req, res, next) {
		// Set links
		var app = req.params.app;
		res.setHeader('Link', [
			'</>; rel="service via grimwire.com/-p2pw/service"; title="Grimwire.net P2PW"',
			'</session>; rel="up service grimwire.com/-session"; id="session"',
			'</session/'+app+'>; rel="self service grimwire.com/-access-token"'
		].join(', '));
		next();
	});

	// Get session info
	// ----------------
	server.head('/', function(req, res) { return res.send(204); });
	server.get('/', getSession, function(req, res) {
		if (!req.accepts('json')) {
			return res.send(406);
		}
		return res.json(res.locals.session);
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
			db.getUser(req.body.id, function(err, dbres) {
				if (err || !dbres.rows[0]) {
					res.writeHead(422, 'bad entity', {'Content-Type': 'application/json'});
					res.end(JSON.stringify({errors:['Invalid username or password.']}));
					return;
				}
				res.locals.user = dbres.rows[0];
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
			db.createSession(req.body.id, null, function(err, dbres) {
				if (err || !dbres.rows[0]) {
					console.error('Failed to create session info in DB', err);
					res.send(500);
					return;
				}

				// Set new session cookie
				req.session = dbres.rows[0].id;
				res.send(204);
			});
		}
	);

	// End session
	// -----------
	server.delete('/', function(req, res) {
		// Remove the session cookie
		req.session = null;
		res.send(204);
	});

	// Get app access-token interface
	// ------------------------------
	server.head('/:app', function(req, res) { return res.send(204); });
	server.all('/:app', middleware.authenticate(db), function(req, res, next) {
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
		var html = require('fs').readFileSync('./static/app-auth.html').toString();
		html = html.replace(/\{APP_DOMAIN\}/g, req.params.app);
		html = html.replace(/\{SESSION_USER\}/g, res.locals.session.user_id);

		// Serve
		res.send(html);
	});

	// Create access-token
	// -------------------
	server.post('/:app', function(req, res) {
		// Generate access token
		db.createSession(res.locals.session.user_id, req.params.app, function(err, dbres) {
			if (err || !dbres.rows[0]) {
				console.error('Failed to create app session in DB', err);
				return res.send(500);
			}

			// Respond
			res.send({ token: res.locals.session.user_id + ':' + dbres.rows[0].id });
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
		// :TODO: for now, no encryption is in place
		cb(plaintext != encrypted);
	}


	// Middleware
	// ==========
	function getSession(req, res, next) {
		// Load session from DB
		db.getSession(req.session, function(err, dbres) {
			if (err) {
				console.error('Failed to get session info from DB', err);
				res.send(500);
				return;
			}
			res.locals.session = dbres ? dbres.rows[0] : null;
			next();
		});
	}

	return server;
};