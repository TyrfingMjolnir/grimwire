var uuidRE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var uuid = require('node-uuid');
var winston = require('winston');
var fs = require('fs');
var path = require('path');
var bcrypt = require('bcrypt');

module.exports = function() {
	var db = { users: {}, sessions: {} };
	var usersPath = path.resolve('./users');

	// Setup
	db.loadUsers = function() {
		// Make sure users directory exists
		if (!fs.existsSync(usersPath)) {
			winston.info('Creating users directory at '+usersPath);
			fs.mkdirSync(usersPath);
		}

		// Load data into memory from files
		winston.info('Reading users files from '+usersPath);
		var userFiles = fs.readdirSync(usersPath);
		var parseUserFile = function (filename, filepath) {
			return function (err, user) {
				// Parse
				if (err) throw err;
				try { user = JSON.parse(user); }
				catch (e) {
					winston.error("Failed to parse JSON in user file:"+filepath);
					return;
				}

				// Validate
				if (!user.id) { winston.error("`id` not found in user file: "+filepath); return; }
				if (user.id != filename) { winston.error("`id` must be the same as the filename: "+filepath); return; }
				if (!user.password) { winston.error("`password` not found in user file: "+filepath); return; }

				// Defaults, in case anything is missing
				if (!user.avatar) { user.avatar = 'user.png'; }
				if (!user.friends) { user.friends = []; }

				// Store in memory
				db.users[user.id] = user;

				// Encrypt password as needed
				if (user.password.indexOf('$2a$10$') !== 0) {
					winston.info('Encrypting password in '+filepath);
					bcrypt.genSalt(10, function(err, salt) {
						bcrypt.hash(user.password, salt, function(err, hash) {
							user.password = hash;
							persistUser(user.id);
						});
					});
				}
			};
		};
		for (var i=0; i < userFiles.length; i++) {
			var filepath = path.join(usersPath, userFiles[i]);
			fs.readFile(filepath, 'utf8', parseUserFile(userFiles[i], filepath));
		}
	};
	db.loadUsers();

	// Users API
	db.getUser = function(userId, cb) {
		cb(null, db.users[userId]);
	};
	db.getUsers = function(cb) {
		cb(null, db.users);
	};
	db.createUser = function(data, cb) {
		if (data.id in db.users) {
			return cb({ conflict: true });
		}
		data.avatar = data.avatar || 'user.png';
		data.friends = data.friends || [];
		data.created_at = new Date();
		db.users[data.id] = data;
		persistUser(data.id, cb);
	};
	db.updateUser = function(userId, data, cb) {
		if (!(userId in db.users)) {
			return cb({ notfound: true });
		}
		var user = db.users[userId];
		for (var k in data) {
			if (k == 'id') continue; // cant update id
			user[k] = data[k];
		}
		persistUser(userId, cb);
	};
	function persistUser(id, cb) {
		if (!(id in db.users)) {
			return cb({ notfound: true });
		}
		var filepath = path.join(usersPath, id);
		fs.writeFile(filepath, JSON.stringify(db.users[id], null, 4), cb);
	}

	// Sessions API
	db.getSession = function(sessionId, cb) {
		if (uuidRE.test(sessionId) === false) { return cb(null, null); }
		cb(null, db.sessions[sessionId]);
	};
	db.createSession = function(userId, app, cb) {
		if (!app) {
			app = null;
		}

		// Get the user
		var user = db.users[userId];
		if (!user) {
			return cb({ notfound: true });
		}

		// Find an available session id
		var sessionId;
		do {
			sessionId = uuid.v4();
		} while (sessionId in db.sessions);

		// Store
		db.sessions[sessionId] = {
			id: sessionId,
			user_id: userId,
			avatar: user.avatar,
			friends: user.friends,
			app: app,
			expires_at: (Date.now() + 1000*60*60*24)
		};
		cb(null, sessionId);
	};
	db.updateSession = function(sessId, data, cb) {
		if (!(sessId in db.sessions)) {
			return cb({ notfound: true });
		}
		var session = db.sessions[sessId];
		if (data.avatar) { session.avatar = data.avatar; }
		if (data.friends) { session.friends = data.friends; }
		cb(null);
	};
	db.deleteUserSessions = function(userId, cb) {
		for (var sid in db.sessions) {
			if (db.sessions[sid].userId == userId) {
				delete db.sessions[sid];
			}
		}
		cb();
	};

	// Clean out old sessions once an hour
	setInterval(function() {
		winston.info('Cleaning expired sessions...');
		var deletions=0, now=Date.now();
		for (var sid in db.sessions) {
			if (db.sessions[sid].expires_at < now) {
				delete db.sessions[sid];
				deletions++;
			}
		}
		winston.info('...Expired sessions cleaned.', { deletions: deletions });
	}, 1000*60*60);

	return db;
};