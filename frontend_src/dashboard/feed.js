/*
httpl://feed

System updates aggregator
*/

var common = require('./common');
var server = servware();
module.exports = server;

var _updates = [];

function mapRev(arr, cb) {
	var newarr = [];
	for (var i=arr.length-1; i >= 0; i--) {
		newarr.push(cb(arr[i], i));
	}
	return newarr;
}

function render_updates() {
	return mapRev(_updates, function(update) {
		return update.html;
	}).join('');
}

function forbidPeers(req, res) {
	var from = req.header('From');
	if (from && from.indexOf('@') !== -1)
		throw 403;
	return true;
}

server.route('/', function(link, method) {
	link({ href: 'httpl://hosts', rel: 'via', id: 'hosts', title: 'Page' });
	link({ href: '/', rel: 'self service collection', id: 'feed', title: 'Updates Feed' });
	// link({ href: '/{id}', rel: 'item', title: 'Update', hidden: true });

	method('HEAD', forbidPeers, function() { return 204; });

	method('GET', forbidPeers, function(req, res) {
		var today = (''+new Date()).split(' ').slice(1,4).join(' ');
		res.headers.link[1].title = 'Updates: '+today;
		var html = [
			'<div class="row">',
				'<div class="col-xs-12">',
					'<h1>'+today+'</h1>',
					'<div id="feed-updates">'+render_updates()+'</div>',
				'</div>',
			'</div>'
		].join('');
		return [200, html, {'content-type': 'text/html'}];
	});

	method('POST', forbidPeers, function(req, res) {
		req.assert({ type: ['text/html', 'text/plain'] });
		var from = req.header('From');
		var origin_untrusted = !!from; // not from the page itself?

		var html = req.body;
		if (origin_untrusted) {
			html = common.escape(html);
		}
		html = '<div>'+html+'</div>';

		var id = _updates.length;
		_updates.push({ id: id, from: from, html: html, created_at: Date.now() });

		// :TODO: replace with nquery
		$('main iframe').contents().find('#feed-updates').html(render_updates());

		res.setHeader('location', 'httpl://'+req.header('Host')+'/'+id);
		return 201;
	});
});

/*server.route('/:id', function(link, method) {
	link({ href: 'httpl://hosts', rel: 'via', id: 'hosts', title: 'Page' });
	link({ href: '/', rel: 'up service collection', id: 'feed', title: 'Updates Feed' });
	link({ href: '/:id', rel: 'self item', id: ':id', title: 'Update :id' });

	method('HEAD', forbidPeers, function() { return 204; });

	method('GET', forbidPeers, function(req, res) {
		var update = _updates[req.pathArgs.id];
		if (!update) throw 404;

		var accept = local.preferredType(req, ['text/html', 'application/json']);
		if (accept == 'text/html')
			return [200, html, {'content-type': 'text/html'}];
		if (accept == 'application/json')
			return [200, update, {'content-type': 'application/json'}];
		throw 406;
	});

	method('PUT', forbidPeers, function(req, res) {
		req.assert({ type: 'text/html' });
		var origin_untrusted = false; // :TODO:

		var update = _updates[req.pathArgs.id];
		if (!update) throw 404;

		var html = req.body;
		if (origin_untrusted) {
			html = '<link href="css/bootstrap.css" rel="stylesheet"><link href="css/iframe.css" rel="stylesheet">'+update.html;
			html = html.replace(/"/g, '&quot;');
			html = '<iframe seamless="seamless" sandbox="allow-popups allow-same-origin allow-scripts" srcdoc="'+html+'"></iframe>';
		} else {
			html = '<div>'+html+'</div>';
		}

		update.html = html;
		return 204;
	});

	method('DELETE', forbidPeers, function(req, res) {
		var update = _updates[req.pathArgs.id];
		if (!update) throw 404;

		delete _updates[req.pathArgs.id];
		return 204;
	});
});*/