var winston = require('winston');
var fs = require('fs');
var path = require('path');
var bcrypt = require('bcrypt');

var usersPath = path.resolve('./users');
var db = { users: {} };
module.exports = db;

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
			if (!/^[a-z0-9_]+$/i.test(user.id)) { winston.error('`id` must pass /^[a-z0-9_]+$/i'); return; }
			if (user.id != filename) { winston.error("`id` must be the same as the filename: "+filepath); return; }
			if (!user.password) { winston.error("`password` not found in user file: "+filepath); return; }

			// Defaults, in case anything is missing
			if (!user.avatar) { user.avatar = 'user.png'; }
			if (!user.max_guest_streams) { user.max_guest_streams = 0; }

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

// Users API
db.getUser = function(userId, cb) {
	cb(null, db.users[userId]);
};
db.getUsers = function(cb) {
	cb(null, db.users);
};
db.countUsers = function(cb) {
	cb(null, Object.keys(db.users).length);
};
db.createUser = function(data, cb) {
	if (data.id in db.users) {
		return cb({ conflict: true });
	}
	db.users[data.id] = {
		id: data.id,
		password: data.password,
		email: data.email,
		avatar: data.avatar || 'user.png',
		max_guest_streams: data.max_guest_streams || 0,
		created_at: new Date()
	};
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