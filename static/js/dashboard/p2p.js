// PeerWeb Networking
// ==================
_peerRelay = local.joinPeerRelay('//'+window.location.host, { stream: 0 }, peerServerFn);
_session_.then(function() {
	_peerRelay.setAccessToken(_session.user_id+':_');
	_peerRelay.startListening();
});

// Stream-taken handling
_peerRelay.on('streamTaken', function() {
	console.log('Dashboard already active, will check again in 15 seconds.');
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
	if (req.path == '/')                        { serveRoot(req, res, peer); }
	else if (req.path == '/friends')            { serveFriends(req, res, peer); }
	else if (req.path.indexOf('/links/') === 0) { serveLinks(req, res, peer); }
	else if (req.path == '/index')              { serveIndex(req, res, peer); }
	else { res.writeHead(404, 'not found').end(); }
}

// /
function serveRoot(req, res, peer) {
	// Set link header
	res.setHeader('link', [
		'</>; rel="self service via grimwire.com/-dashboard"; user="'+_session.user_id+'"; app="'+window.location.hostname+'"; title="Grimwire Relay"',
		'</friends>; rel="collection grimwire.com/-friends"; id="friends"; user="'+_session.user_id+'"; app="'+window.location.hostname+'"; title="Friends"',
		'</links/{id}>; rel="collection grimwire.com/-links"; user="'+_session.user_id+'"; app="'+window.location.hostname+'"; title="Application Links"',
		'</index{?user}>; rel="index grimwire.com/-index"; user="'+_session.user_id+'"; app="'+window.location.hostname+'"; title="Active Resources"'
	].join(','));

	// Handle HEAD
	if (req.method == 'HEAD')
		return res.writeHead(204, 'ok, no content').end();

	// Handle GET
	if (req.method == 'GET') {
		res.writeHead(200, 'ok', { 'content-type': 'application/json' }).end({
			user_id: _session.user_id,
			avatar: _session.avatar
		});
	}

	res.writeHead(405, 'bad method').end();
}

// /friends
function serveFriends(req, res, peer) {
	// Set link header
	res.setHeader('link', [
		'</>; rel="up service via grimwire.com/-dashboard"; user="'+_session.user_id+'"; app="'+window.location.hostname+'"; title="Grimwire Relay"',
		'</friends>; rel="self collection grimwire.com/-friends"; id="friends"; user="'+_session.user_id+'"; app="'+window.location.hostname+'"; title="Friends"'
	].join(','));

	// Handle HEAD
	if (req.method == 'HEAD')
		return res.writeHead(204, 'ok, no content').end();

	// Handle GET
	if (req.method == 'GET') {
		// Perms
		if (peer.getPeerInfo().user != _session.user_id) {
			return res.writeHead(403, 'forbidden - cant read other users\'s friends').end();
		}

		return res.writeHead(200, 'ok', { 'content-type': 'application/json' }).end(_session.friends);
	}

	res.writeHead(405, 'bad method').end();
}

// /links/{id}
function serveLinks(req, res, peer) {
	// Parse ID
	var id = decodeURIComponent(req.path.slice(7));
	var peerd = local.parsePeerDomain(id);
	if (!peerd) {
		return res.writeHead(400, 'bad request - url must include a valid peer domain').end();
	}

	// Set link header
	res.setHeader('link', [
		'</>; rel="up service via grimwire.com/-dashboard"; user="'+_session.user_id+'"; app="'+window.location.hostname+'"; title="Grimwire Relay"',
		'</links/'+id+'>; rel="self collection grimwire.com/-links"; id="'+id+'"; user="'+_session.user_id+'"; app="'+window.location.hostname+'"; title="Application Links"'
	].join(','));

	// Handle HEAD
	if (req.method == 'HEAD')
		return res.writeHead(204, 'ok, no content').end();

	// Handle GET
	if (req.method == 'GET') {
		var appLinks = _user_links[id];
		return res.writeHead(200, 'ok', { 'content-type': 'application/json' }).end(appLinks);
	}

	// Handle PUT
	if (req.method == 'PUT') {
		// Perms
		if (peer.getPeerInfo().user != _session.user_id) {
			return res.writeHead(403, 'forbidden - apps can only set links for their users').end();
		}
		if (id != peer.config.domain) {
			return res.writeHead(403, 'forbidden - apps can only set their own links').end();
		}

		return req.finishStream().then(function(body) {
			// Validate
			body = local.httpHeaders.deserialize('link', body);
			if (!Array.isArray(body)) {
				return res.writeHead(422, 'bad entity - body must be a list of links').end();
			}
			body.forEach(function(link) {
				link.user = peer.getPeerInfo().user;
				link.app = peer.getPeerInfo().app;
				if (!local.isAbsUri(link.href)) {
					link.href = 'httpl://'+id+link.href;
				}
			});

			// Update
			_user_links[id] = body;

			// Update UI
			renderAll();

			// Respond
			res.writeHead(204, 'ok, no content').end();
		});
	}

	// Handle DELETE
	if (req.method == 'DELETE') {
		// Perms
		if (id != peer.config.domain) {
			return res.writeHead(403, 'forbidden - apps can only remove their own links').end();
		}

		// Update
		delete _user_links[id];

		// Update UI
		renderAll();

		// Respond
		return res.writeHead(204, 'ok, no content').end();
	}

	res.writeHead(405, 'bad method').end();
}

// /index
function serveIndex(req, res, peer) {
	// Set link header
	var links = [
		'</>; rel="up service via grimwire.com/-dashboard"; user="'+_session.user_id+'"; app="'+window.location.hostname+'"; title="Grimwire Relay"',
		'</index{?user}>; rel="self index grimwire.com/-index"; user="'+_session.user_id+'"; app="'+window.location.hostname+'"; title="Active Resources"'
	];
	for (var domain in _user_links) {
		links.push(local.httpHeaders.serialize('link', _user_links[domain]));
	}
	if (req.query.user != _session.user_id) {
		for (var userId in _friend_links) {
			links.push(local.httpHeaders.serialize('link', _friend_links[userId]));
		}
	}
	res.setHeader('link', links.join(', '));

	// Handle HEAD
	if (req.method == 'HEAD')
		return res.writeHead(204, 'ok, no content').end();

	res.writeHead(405, 'bad method').end();
}