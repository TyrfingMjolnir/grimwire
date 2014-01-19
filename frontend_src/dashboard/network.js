
var common = require('./common');
var network = module.exports = {};

/*
var network_sid = localStorage.getItem('network_sid');
var is_first_session = network_sid === null;
if (is_first_session) network_sid = genDeviceSid();
*/
// Prep the relay connection
network.setupRelay = function(serviceURL, relay) {
	network.serviceURL = serviceURL;
	network.relay = relay;

	relay.on('accessGranted', function() { relay.startListening(); });
	relay.on('notlistening', function() { common.feedUA.POST('<strong>Network Relay Connection Closed</strong>. You can no longer accept peer connections.', { Content_Type: 'text/html' }); });
	relay.on('listening', function() { common.feedUA.POST('<strong>Connected to Network Relay</strong>. You can now accept peer connections.', { Content_Type: 'text/html' }); });
	relay.on('outOfStreams', function() { common.feedUA.POST('<strong>No more connections available on your account</strong>. Close some other apps and try again.', { Content_Type: 'text/html' }); });
	relay.setServer(peerProxy);
	// :TODO: - use the code below if device network-identity persistence matters (eg for tracking a dataset)
	/*relay.autoRetryStreamTaken = false; // :TODO (may not need): the relay created by grimwidget does this automatically
	relay.on('accessGranted', function() {
		relay.setSid(network_sid);
		relay.startListening();
	});
	relay.on('streamTaken', function() {
		// If a stream collision occurred, generate a new sid based on whether this is a new device in the network
		network_sid = (is_first_session) ? common.genDeviceSid() : common.genSessionSid(network_sid);
		relay.setSid(network_sid);
		relay.startListening();
	});
	relay.on('listening', function() {
		relay.registerLinks([
			{ href: '/', rel: 'self service mail.gwr.io', title: 'Syncmail' },
			{ href: '/folders', rel: 'collection mail.gwr.io/folders', id: 'folders', title: 'Mail Folders' }
		]);
		local.dispatch({ method: 'REFRESH', url: 'layout.app' });
		if (is_first_session) { // save the sid if this was a new device
			console.log('Detected first run on this device, assigned network identity with sid:', network_sid);
			localStorage.setItem('network_sid', network_sid);
		} else {
			console.log('Assumed existing network identity with sid:', network_sid);
		}
	});*/
};

// Handles requests from oeers
function peerProxy(req, res, peer) {
	var via = [{proto: {version:'1.0', name:'HTTPL'}, hostname: req.header('Host')}];
	var links = [{ href: '/', rel: 'service', title: network.relay.getUserId() }];
	res.setHeader('Via', (req.parsedHeaders.via||[]).concat(via));

	// Home resource
	if (req.path == '/') {
		if (network.relay.registeredLinks) {
			links = links.concat(network.relay.registeredLinks);
		}
		links.rel += ' self';
		res.setHeader('Link', links);
		return res.writeHead(204, 'OK, No Content').end();
	}
	// links[0].rel += ' via';

	// Parse path
	var proxy_uri = decodeURIComponent(req.path.slice(1));
	var proxy_urid = local.parseUri(proxy_uri);

	// Only allow for published servers
	var server = local.getServer(proxy_urid.authority);
	if (!server) return res.writeHead(404, 'Not Found').end();
	if (!server.context || !server.context.config || !server.context.config.on_network)
		return res.writeHead(404, 'Not Found').end();

	// Pass the request through
	var req2 = new local.Request({
		method: req.method,
		url: proxy_uri,
		query: local.util.deepClone(req.query),
		headers: local.util.deepClone(req.headers),
		stream: true
	});

	// Put origin and public name into the headers
	var from = req.header('From');
	if (!from) from = peer.config.domain;
	else if (local.parseUri(from).authority != peer.config.domain) {
		from = local.joinUri(peer.config.domain, encodeURIComponent(from));
	}
	req2.header('From', from);
	req2.header('Host', proxy_urid.authority);
	req2.header('X-Public-Host', local.joinUri(req.header('Host'), proxy_urid.authority));
	req2.header('Via', (req.parsedHeaders.via||[]).concat(via));

	var res2_ = local.dispatch(req2);
	res2_.always(function(res2) {
		// Set headers
		res2.header('Link', res2.parsedHeaders.link); // use parsed headers, since they'll all be absolute now
		res2.header('Via', via.concat(res2.parsedHeaders.via||[]));

		// Pipe back
		res.writeHead(res2.status, res2.reason, res2.headers);
		res2.on('data', function(chunk) { res.write(chunk); });
		res2.on('end', function() { res.end(); });
		res2.on('close', function() { res.close(); });
	});
	req.on('data', function(chunk) { req2.write(chunk); });
	req.on('end', function() { req2.end(); });
}

// A local proxy to the remote host
// - somewhat temporary, mainly an easy way to introduce the host services into the local namespace
network.hostProxy = function(req, res) {
	var req2 = new local.Request({
		method: req.method,
		url: network.serviceURL+req.path,
		query: local.util.deepClone(req.query),
		headers: local.util.deepClone(req.headers),
		stream: true
	});
	local.dispatch(req2).always(function(res2) {
		res.writeHead(res2.status, res2.reason, res2.headers);
		res2.on('data', function(data) { res.write(data); });
		res2.on('end', function() { res.end(); });
		return res2;
	});
	req.on('data', function(chunk) { req2.write(chunk); });
	req.on('end', function() { req2.end(); });
};

// Helper to gather published links and send them to the host service
network.publishNetworkLinks = function() {
	// Gather servers that are marked 'on_network'
	var servers = local.getServers();
	var domains = [];
	for (var domain in servers) {
		var server = servers[domain].context;
		if (server && server.config && server.config.on_network) {
			domains.push(domain);
		}
	}

	// Fetch self links
	var links = [];
	local.promise.bundle(domains.map(local.HEAD.bind(local))).then(function(ress) {
		network.relay.registerLinks(ress.map(function(res, i) {
			var selfLink = local.queryLinks(res, { rel: 'self' })[0];
			if (!selfLink) {
				selfLink = { rel: 'service', id: domains[i] };
			}
			selfLink.rel = (selfLink.rel) ? selfLink.rel.replace(/(^|\b)(self|up|via)(\b|$)/gi, '') : 'service';
			selfLink.href = '/'+encodeURIComponent(domains[i]); // Overwrite href

			return selfLink;
		}));
	});
};


/*var relay = grimwidget.getRelay();
common.getSessionUser = relay.getUserId.bind(relay);
common.getSessionRelay = function() {
	var providerd = local.parseUri(relay.getProvider() || '');
	if (providerd) return providerd.authority;
	return '';
};
common.getSessionEmail = function() { return common.getSessionUser() + '@' + common.getSessionRelay(); };
common.isPeerSessionUser = function(peer) {
	return (peer.getPeerInfo().user == common.getSessionUser() && peer.getPeerInfo().relay == common.getSessionRelay());
};
function genDeviceSid() { return Math.round(Math.random()*10000)*100; }; // [0,1000000) with a step of 100
common.genDeviceSid = genDeviceSid;
common.genSessionSid = function(deviceSid) { return deviceSid+Math.round(Math.random()*99)+1; }; // [deviceSid+1, deviceSid+100)
common.genDeviceName = function() {
	if (navigator.userAgent.indexOf('Opera') !== -1) return 'Opera';
	else if (navigator.userAgent.indexOf('MSIE') !== -1) return 'IE';
	else if (navigator.userAgent.indexOf('Chrome') !== -1) return 'Chrome';
	else if (navigator.userAgent.indexOf('Safari') !== -1) return 'Safari';
	else if (navigator.userAgent.indexOf('Firefox') !== -1) return 'Firefox';
	// :TODO: mobile
	return 'device';
};*/