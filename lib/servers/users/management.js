var config = require('../../config');
var db = require('../../db');
var sessions = require('../../sessions');
var streams = require('../../streams');
var util = require('../../util.js');
var bcrypt = require('bcrypt');
var winston = require('winston');

// Users - Management
// ==================
module.exports = function(server) {

	// Get users
	// ---------
	server.head('/', function(req, res) {
		if (req.query.index == 'users' && !req.query.online) {
			// Load full list from DB
			db.getUsers(function(err, users) {
				if (err) {
					winston.error('Failed to load users from DB', { error: err, inputs: [], request: util.formatReqForLog(req) });
					return res.send(500);
				}
				// Add all users to link index
				var h = res.getHeader('Link');
				for (var k in users) {
					var id = users[k].id;
					h += ', </u/'+id+'>; rel="item gwr.io/user"; title="User: '+id+'"; id="'+id+'"';
				}
				res.setHeader('Link', h);
				res.send(204);
			});
		} else {
			res.send(204);
		}
	});
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
		function(req, res, next) {
			if (req.query.index == 'users' && !req.query.online) {
				// Add all users to link index
				var h = res.getHeader('Link');
				var users = res.locals.users;
				for (var k in users) {
					var id = users[k].id;
					h += ', </u/'+id+'>; rel="item gwr.io/user"; title="User: '+id+'"; id="'+id+'"';
				}
				res.setHeader('Link', h);
			}
			next();
		},
		function(req, res) {
			// Construct output
			var rows = {}, users = res.locals.users, emptyArr = [];
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
				if (!res.locals.session.app) { // not a third party app, include sensitive data
					rows[user.id].email = user.email;
				}
				if (req.query.link_bodies) {
					rows[user.id].links = (onlineUser) ? onlineUser.links : emptyArr;
				}
				// Add session-user data
				if (user.id == sessionUserId) {
					onlineUser = onlineUser || {};
					rows[user.id].num_user_streams = onlineUser.num_user_streams || 0;
					rows[user.id].max_user_streams = user.max_user_streams || config.max_user_streams;
					rows[user.id].num_guest_streams = onlineUser.num_guest_streams || 0;
					rows[user.id].max_guest_streams = user.max_guest_streams || 0;
				}
			}
			for (var k in streams.guest_users) {
				var user = streams.guest_users[k];
				// Add row
				rows[user.id] = {
					id: user.id,
					guestof: user.guestof,
					online: !!(user.streams.length),
					avatar: 'user_silhouette.png',
					created_at: user.created_at
				};
				if (req.query.link_bodies) {
					rows[user.id].links = user.links;
				}
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

		// Lowercase the username
		body.id = body.id.toLowerCase();

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
				avatar: user.avatar || 'user_silhouette.png',
				created_at: user.created_at
			};
			if (!res.locals.session.app) { // not a third party app, include sensitive data
				item.email = user.email;
			}

			// Add session-user data
			if (user.id == res.locals.session.user_id) {
				onlineUser = streams.online_users || {};
				item.num_user_streams = onlineUser.num_user_streams || 0;
				item.max_user_streams = user.max_user_streams || config.max_user_streams;
				item.num_guest_streams = onlineUser.num_guest_streams || 0;
				item.max_guest_streams = user.max_guest_streams || 0;
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

		// Dont allow 3rd-party apps or guests to make updates
		if (session.app || session.guestof) {
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
			else if (req.body.email.split('@').length != 2) { errors.email = 'Invalid email address.';  }
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

		// Get user
		db.getUser(req.params.userId, function(err, user) {
			if (err) {
				if (err.notfound) { return res.send(404); }
				winston.error('Failed to get user from DB', { error: err, inputs: [req.params.userId], request: util.formatReqForLog(req) });
				return res.send(500);
			}
			if (!user) return res.send(404);

			// Forbid if setting email that's already set
			if (user.email && updates.email && user.email != updates.email) {
				res.writeHead(403, 'Forbidden: must use gwr.io/confirmed-update to change an already-set email');
				return res.end();
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
						// jk, no updates to be made right now
					}

					// Send response
					res.send(204);
				});
			});
		});
	});
};