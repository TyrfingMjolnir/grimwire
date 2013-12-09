var config = require('../config');
var db = require('../db');
var streams = require('../streams');
var middleware = require('../middleware.js');
var express = require('express');
var winston = require('winston');

// Users
// =====
module.exports = function() {

	// Server State
	// ============
	var server = express();

	// For use in /status
	server.getStatus = function(user) {
		var status = { you: streams.online_users[user.id] || 'no active streams' };
		status.you.streamdebugs = (status.you.streams) ? status.you.streams.map(function(uri) {
			var s = streams.online_streams[uri];
			return {
				uri: uri,
				connection: { destroyed: s.connection.destroyed, bytesRead: s.connection.bytesRead, writable: s.connection.writable, readable: s.connection.readable },
				writable: s.writable,
				finished: s.finished
			};
		}) : [];
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
	server.all('/:userId/s/:appDomain/:sid', middleware.authenticate);

	// Linking
	// -------
	server.all('/', function (req, res, next) {
		// Set links
		var links = [
			'</>; rel="up via service gwr.io/grimwire"; title="Grimwire Relay"',
			'</u{?online,links,link_bodies}>; rel="self collection gwr.io/relays gwr.io/users"; id="users"',
			'</u/{id}>; rel="item gwr.io/user"',
			'</u/{user}/s/{app}/{sid}{?nc}>; rel="item gwr.io/relay"'
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
			'</>; rel="via service gwr.io/grimwire"; title="Grimwire Relay"',
			'</u{?online,links,link_bodies}>; rel="up collection gwr.io/relays gwr.io/users"; id="users"',
			'</u/'+userId+'>; rel="self item gwr.io/user"; id="'+userId+'"',
			'</u/'+userId+'/s/{app}/{sid}{?nc}>; rel="gwr.io/relay"',
			'</u/'+userId+'/update>; rel="gwr.io/confirmed-update"'
		].join(', '));
		next();
	});
	server.all('/:userId/s/:appDomain/:sid', function(req, res, next) {
		// Set links
		var userId = req.params.userId;
		var appDomain = req.params.appDomain;
		var sid = req.params.sid;
		res.setHeader('Link', [
			'</>; rel="via service gwr.io/grimwire"; title="Grimwire Relay"',
			'</u{?online,links,link_bodies}>; rel="up collection gwr.io/relays gwr.io/users"; id="users"',
			'</u/'+userId+'>; rel="gwr.io/user"; id="'+userId+'"',
			'</u/'+userId+'/s/'+appDomain+'/'+sid+'{?nc}>; rel="self item gwr.io/relay"'
		].join(', '));
		next();
	});

	// Add routes
	require('./users/management.js')(server);
	require('./users/sensitive_updates.js')(server);
	require('./users/streams.js')(server);

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