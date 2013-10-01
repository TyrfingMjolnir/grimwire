// PeerWeb Networking
// ==================
_peerRelay = local.joinPeerRelay(window.location.protocol+'//'+window.location.host, { stream: 0 }, peerServerFn);
_session_.then(function() {
	// Connect to relay
	_peerRelay.setAccessToken(_session.user_id+':_');
	_peerRelay.startListening();

	// Fetch links
	fetchUserLinks();
	fetchFriendLinks();
});

// Stream-taken handling
_peerRelay.on('streamTaken', function() {
	console.log('Your dashboard is already online, maybe in another tab or browser? Will check again in 15 seconds.');
	setTimeout(function() {
		_peerRelay.startListening();
	}, 15000);
});

// Disconnect handling
_peerRelay.on('disconnected', function(e) {
	// Clear out links
	if (e.peer.user == _session.user_id) {
		delete _user_links[e.domain];
	} else {
		delete _friend_links[e.peer.user];
	}

	// Update UI
	renderAll();
});

// Peer Server
function peerServerFn(req, res, peer) {
	// :TODO: friends and self only?
	if (req.path == '/')             { serveRoot(req, res, peer); }
	else if (req.path == '/friends') { serveFriends(req, res, peer); }
	else if (req.path == '/index')   { serveIndex(req, res, peer); }
	else { res.writeHead(404, 'not found').end(); }
}

// /
function serveRoot(req, res, peer) {
	// Set link header
	res.setHeader('link', [
		{ href: '/', rel: 'self service via grimwire.com/-dashboard', user: _session.user_id, app: window.location.hostname, title: 'Grimwire Relay' },
		{ href: '/friends', rel: 'collection grimwire.com/-friends', user: _session.user_id, app: window.location.hostname, title: 'Friends' },
		{ href: '/index', rel: 'collection grimwire.com/-index', user: _session.user_id, app: window.location.hostname, title: 'Active Resources' }
	]);

	// Handle method
	switch (req.method) {
		case 'HEAD':
			return res.writeHead(204, 'ok, no content').end();

		case 'GET':
			return res.writeHead(200, 'ok', { 'content-type': 'application/json' }).end({
				user_id: _session.user_id,
				avatar: _session.avatar
			});

		default:
			return res.writeHead(405, 'bad method').end();
	}
}

// /friends
function serveFriends(req, res, peer) {
	// Set link header
	res.setHeader('link', [
		{ href: '/', rel: 'up service via grimwire.com/-dashboard', user: _session.user_id, app: window.location.hostname, title: 'Grimwire Relay' },
		{ href: '/friends', rel: 'self collection grimwire.com/-friends', user: _session.user_id, app: window.location.hostname, title: 'Friends' }
	]);

	// Handle method
	switch (req.method) {
		case 'HEAD':
			return res.writeHead(204, 'ok, no content').end();

		case 'GET':
			// Perms
			if (peer.getPeerInfo().user != _session.user_id) {
				return res.writeHead(403, 'forbidden - cant read other users\'s friends').end();
			}

			return res.writeHead(200, 'ok', { 'content-type': 'application/json' }).end(_session.friends);

		default:
			return res.writeHead(405, 'bad method').end();
	}
}

// /index
function serveIndex(req, res, peer) {
	var user = peer.getPeerInfo().user;

	// Handle method
	switch (req.method) {
		case 'HEAD':
			// Respond
			linkIndex(req, res, peer);
			return res.writeHead(204, 'ok, no content').end();

		case 'POST':
			// Validate type
			if (req.headers['content-type'] != 'application/json' && req.headers['content-type'] != 'text/plain') {
				return res.writeHead(415, 'bad content-type: must be json or text/plain').end();
			}
			req.finishStream().then(function(body) {
				// Prepare the links
				body = local.httpHeaders.deserialize('link', body);
				if (!Array.isArray(body)) { body = [body]; }
				for (var i=0; i < body.length; i++) {
					var link = body[i];
					// Validate
					if (!link || typeof link != 'object' || !link.href) {
						return res.writeHead(422, 'bad ent: link '+i+' did not parse into a link object').end();
					}
					// Prepend the host on relative uris
					if (!local.isAbsUri(link.href)) {
						link.href = peer.getUrl() + link.href;
					}
					// Ensure certain attributes
					link.app = peer.getPeerInfo().app;
					link.user = peer.getPeerInfo().user;
				}

				// Update index
				if (user == _session.user_id) {
					_user_links[peer.config.domain] = body;
					$('#'+_session.user_id+'-links').html(renderUserLinks());
				} else {
					_friend_links[user] = body;
					$('#'+user+'-links').html(rendeFriendLinks(user));
				}

				// Respond
				linkIndex(req, res, peer);
				res.writeHead(204, 'ok, no content').end();
			});
			break;

		default:
			return res.writeHead(405, 'bad method').end();
	}
}

function linkIndex(req, res, peer) {
	// Build link header
	var links = [
		{ href: '/', rel: 'up service via grimwire.com/-dashboard', user: _session.user_id, app: window.location.hostname, title: 'Grimwire Relay' },
		{ href: '/index', rel: 'self collection grimwire.com/-index', user: _session.user_id, app: window.location.hostname, title: 'Active Resources' }
	];

	// Add session links
	for (var domain in _user_links) {
		links = links.concat(_user_links[domain]);
	}

	// Add friend links if this request is from the session owner
	if (peer.getPeerInfo().user == _session.user_id) {
		for (var userId in _friend_links) {
			links = links.concat(_friend_links[userId]);
		}
	}

	// Set header
	res.setHeader('link', links);
}