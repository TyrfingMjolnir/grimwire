var winston = require('winston');

var config = require('./config');
var db = require('./db');
var streams = {
	// Active streams
	// - maps peerURI -> http.ServerResponse
	online_streams: {},
	// Active users
	// - maps username -> [{id:username,links:[...], ...]
	online_users: {},
	// Active guest users (additional references to items kept in online_users)
	guest_users: {}
};
module.exports = streams;

// Streams API
streams.peerUriRE = /^(.+)@([^!]+)!([^!\/]+)(?:!([\d]+))?$/i;
streams.createPeerUri = function(user, app, stream) {
	// this function must mirror the local.js PeerWebRelay.prototype.makeDomain definition
	return user+'@'+config.authority+'!'+app+'!'+(stream||'0');
};

streams.createOnlineUser = function(userRecord) {
	return {
		id: userRecord.id,
		guestof: false,
		num_user_streams: 0,
		num_guest_streams: 0,
		streams: [], // an array of peerUris
		links: [] // an array of link objects
	};
};

streams.createOnlineGuest = function(guestUserId, hostUserId) {
	return {
		id: guestUserId,
		guestof: hostUserId,
		num_user_streams: 0,
		streams: [], // an array of peerUris
		links: [] // an array of link objects (should always be empty, since guests cant register links)
	};
};

streams.getOrCreateUser = function(userId, cb) {
	// Load user record
	db.getUser(userId, function(err, userRecord) {
		if (err) {
			winston.error('Failed to load user from DB', { error: err, inputs: [userId] });
			return cb(err);
		}

		// Add to / Read from memory
		var user = streams.online_users[userId];
		if (!user) {
			user = streams.online_users[userId] = streams.createOnlineUser(userRecord);
		}
		cb(null, streams.online_users[userId], userRecord);
	});
};

streams.removeUser = function(user) {
	delete streams.online_users[user.id];
};

streams.getOrCreateGuest = function(userId, hostUser, cb) {
	if (!streams.online_users[userId]) {
		streams.online_users[userId] = streams.guest_users[userId] = streams.createOnlineGuest(userId, hostUser.id);
	}
	cb(null, streams.online_users[userId]);
};

streams.removeGuest = function(user) {
	delete streams.guest_users[user.id];
};

streams.addStream = function(stream, cb) {
	var userId = stream.locals.userId;
	var app = stream.locals.app || config.hostname;
	var guestof = stream.locals.guestof;

	// Check stream availability
	if (guestof) {
		// Get/create host user
		streams.getOrCreateUser(guestof, function(err, hostUser, hostUserRecord) {
			if (err) { return cb(err); }

			// Check stream limit
			if (hostUser.num_guest_streams + 1 > hostUserRecord.max_guest_streams) { return cb({ outOfStreams: true }); }
			if (hostUser.num_user_streams + hostUser.num_guest_streams + 1 > hostUserRecord.max_user_streams) { return cb({ outOfStreams: true }); }

			// Good to go, get/create guest account
			hostUser.num_guest_streams++;
			streams.getOrCreateGuest(userId, hostUser, trackStream);
		});
	} else {
		// Get/create user
		streams.getOrCreateUser(userId, function(err, user, userRecord) {
			if (err) { return cb(err); }

			// Check stream limit
			if (user.num_user_streams + user.num_guest_streams + 1 > userRecord.max_user_streams) { return cb({ outOfStreams: true }); }

			// Good to go
			trackStream(null, user);
		});
	}

	// Check whether the user has a stream available
	function trackStream(err, user) {
		if (err) { return cb(err); }

		// Track the new stream
		streams.online_streams[stream.locals.peerUri] = stream;
		stream.on('close', streams.onResStreamClosed);
		user.num_user_streams++;
		user.streams.push(stream.locals.peerUri);

		// Done
		cb(null, user);
	}
};

// - handles stream close by client
streams.onResStreamClosed = function() {
	var stream   = this;
	var app      = stream.locals.app;
	var streamId = stream.locals.streamId;
	var peerUri  = stream.locals.peerUri;
	var userId   = stream.locals.userId;
	var guestof  = stream.locals.guestof;

	// Clear connection
	stream.removeAllListeners('close');

	// Remove tracking
	delete streams.online_streams[peerUri];
	var user = streams.online_users[userId];
	if (user) {
		streams.removeUserLinks(user, stream);
		streams.removeUserStream(user, stream);

		// Remove user if there are no active streams
		if (!user.num_user_streams && !user.num_guest_streams) {
			streams.removeUser(user);
			if (guestof) { streams.removeGuest(user); }
		}
	}
	if (guestof) {
		var hostUser = streams.online_users[guestof];
		if (hostUser) {
			hostUser.num_guest_streams--;

			// Remove host user if there are no active streams
			if (!hostUser.num_user_streams && !hostUser.num_guest_streams) {
				streams.removeUser(hostUser);
			}
		}
	}
};

streams.removeUserStream = function(user, stream) {
	var streamIndex = user.streams.indexOf(stream.locals.peerUri);
	if (streamIndex !== -1) {
		user.streams.splice(streamIndex, 1);
		user.num_user_streams--;
	}
};

streams.emitTo = function(peerUri, msg) {
	var stream = streams.online_streams[peerUri];
	if (!stream) {
		return false;
	}
	stream.write(msg);
	return true;
};

streams.addUserLinks = function(user, stream, links) {
	// Clear URI-based attributes that Local.js adds automatically in parsing, add some metadata
	// - clearing keeps headers small and stops apps from attempting to overwrite the values
	// - metadata used for filtering
	links.forEach(function(link) {
		// Clear values that local.js extracts from the URI
		delete link.host_domain;
		delete link.host_user;
		delete link.host_relay;
		delete link.host_app;
		delete link.host_stream;
		// Add standard attributes
		link.relay_user = user.id;
		// Add metadata for filtering
		Object.defineProperty(link, '__app', { value: stream.locals.app, enumerable: false });
		Object.defineProperty(link, '__stream', { value: stream.locals.streamId, enumerable: false });
	});

	// Add links
	user.links = user.links.concat(links);
};

streams.removeUserLinks = function(user, stream) {
	user.links = user.links.filter(function(link) {
		return !(link.__stream == stream.locals.streamId && link.__app == stream.locals.app);
	});
};

// Clean out old sessions once an hour
setInterval(function() {
	winston.info('Cleaning stale streams...');
	var deletions=0;
	for (var uri in streams.online_streams) {
		var stream = streams.online_streams[uri];
		if (stream && stream.connection && (!stream.connection.writable || stream.connection.destroyed)) {
			streams.onResStreamClosed.call(stream);
			deletions++;
		}
	}
	winston.info('...Stale streams cleaned.', { deletions: deletions });
}, 1000*60*5);