/*
httpl://feed

System updates aggregator
*/

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

server.route('/', function(link, method) {
	link({ href: 'httpl://hosts', rel: 'via', id: 'hosts', title: 'Page' });
	link({ href: '/', rel: 'self service collection', id: 'feed', title: 'Updates Feed' });
	link({ href: '/{id}', rel: 'item', title: 'Update', hidden: true });

	method('GET', function(req, res) {
		var originUntrusted = false; //:TODO:

		var html = [
			'<div class="row">',
				'<div class="col-xs-12">',
					'<h1>'+(''+new Date()).split(' ').slice(1,4).join(' ')+'</h1>',
					'<div id="feed-updates">'+render_updates()+'</div>',
				'</div>',
			'</div>'
		].join('');
		return [200, html, {'content-type': 'text/html'}];
	});

	method('POST', function(req, res) {
		req.assert({ type: 'text/html' });
		var origin_untrusted = false; // :TODO:

		var html = req.body;
		if (origin_untrusted) {
			html = '<link href="css/bootstrap.css" rel="stylesheet"><link href="css/iframe.css" rel="stylesheet">'+update.html;
			html = html.replace(/"/g, '&quot;');
			html = '<iframe seamless="seamless" sandbox="allow-popups allow-same-origin allow-scripts" srcdoc="'+html+'"></iframe>';
		} else {
			html = '<div>'+html+'</div>';
		}

		var id = _updates.length;
		_updates.push({ id: id, html: html, created_at: Date.now() });

		// :TODO: replace with nquery
		$('#feed-updates').html(render_updates());

		res.setHeader('location', 'httpl://'+req.host+'/'+id);
		return 201;
	});
});

server.route('/:id', function(link, method) {
	link({ href: 'httpl://hosts', rel: 'via', id: 'hosts', title: 'Page' });
	link({ href: '/', rel: 'up service collection', id: 'feed', title: 'Updates Feed' });
	link({ href: '/:id', rel: 'self item', id: ':id', title: 'Update :id' });

	method('GET', function(req, res) {
		var update = _updates[req.pathArgs.id];
		if (!update) throw 404;

		var accept = local.preferredType(req, ['text/html', 'application/json']);
		if (accept == 'text/html')
			return [200, html, {'content-type': 'text/html'}];
		if (accept == 'application/json')
			return [200, update, {'content-type': 'application/json'}];
		throw 406;
	});

	method('PUT', function(req, res) {
		req.assert({ type: 'text/html' });
		var origin_untrusted = false; // :TODO:

		var update = _updates[req.pathArgs.id];
		if (!update) throw 404;

		if (/*!from_update_owner*/false) // :TODO:
			throw 403;

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

	method('DELETE', function(req, res) {
		var update = _updates[req.pathArgs.id];
		if (!update) throw 404;

		delete _updates[req.pathArgs.id];
		return 204;
	});
});