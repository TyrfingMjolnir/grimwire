var config = require('../../config');
var db = require('../../db');
var streams = require('../../streams');
var winston = require('winston');

// Users - Streams
// ===============
module.exports = function(server) {

	// Get Stream Info
	// ---------------
	server.head('/:userId/s/:appDomain/:sid', function(req, res) { return res.send(204); });
	server.get('/:userId/s/:appDomain/:sid', function(req, res, next) {
		// Content negotiation
		if (!req.accepts('json')) {
			return res.send(406);
		}

		// Fetch user & stream
		var peerUri = streams.createPeerUri(req.params.userId, req.params.appDomain, req.params.sid);
		var stream = streams.online_streams[peerUri];
		var user = streams.online_users[req.params.userId];
		if (!stream || !user) {
			return res.send(404);
		}

		// Extract links
		var links = user.links.filter(function(link) { return link.__app == req.params.appDomain && link.__sid == req.params.sid; });

		// Send response
		return res.json({ links: links });
	});

	// Update Stream Info
	// ------------------
	server.patch('/:userId/s/:appDomain/:sid', function(req, res, next) {
		var session = res.locals.session;
		var session_app = session.app || config.authority;
		var peerUri = streams.createPeerUri(req.params.userId, req.params.appDomain, req.params.sid);

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
		if (req.params.userId != session.user_id || session_app != req.params.appDomain) {
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

			var num_links = links.length;
			if (num_links > 5) {
				return res.send(422, {errors:{links:'Unable to register more than 5 links to a stream.'}});
			}

			for (var i=0; i < num_links; i++) {
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
	server.subscribe('/:userId/s/:appDomain/:sid', function(req, res) {
		var session = res.locals.session;
		var session_app = session.app || config.authority;

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
		res.locals.sid = req.params.sid;
		res.locals.guestof  = session.guestof;
		res.locals.peerUri  = streams.createPeerUri(res.locals.userId, res.locals.app, res.locals.sid);

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
			res.setTimeout(5*60*1000);
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
	server.notify('/:userId/s/:appDomain/:sid', function (req, res, next) {
		var session = res.locals.session;
		var session_app = session.app || config.authority;

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
			// :DEBUG: todo
			// See if this is a remote network
			/*var peerd = streams.peerUriRE.exec(body.dst[i]);
			if (!peerd) continue;
			if (peerd[2] != config.authority) {
				console.log('Other network', config.authority, peerd);
				var options = {
					pfx:  require('fs').readFileSync('pfrazee.pfx'),
					passphrase: 'foobar',
					// key: require('fs').readFileSync('ssl-key.pem'),
					// cert: require('fs').readFileSync('ssl-cert2.pem'),
					// ca: [require('fs').readFileSync('/home/pfraze/global_root_cas.pem')],
					// passphrase: 'Vn8D5Omr0ARYzTZ2E2o4',
					method: 'GET', hostname: peerd[2], path: '/'
				};
				console.log(options);
				var outReq = require('https').request(options, function(res) {
					console.log('STATUS: ' + res.statusCode);
					console.log('HEADERS: ' + JSON.stringify(res.headers));
					res.setEncoding('utf8');
					res.on('data', function (chunk) {
						console.log('BODY: ' + chunk);
					});
				});
				outReq.on('error', console.log.bind(console));
				outReq.end();
				// :TODO:
				continue;
			}*/

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
};