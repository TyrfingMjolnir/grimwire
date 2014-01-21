/*
httpl://feed

System updates aggregator
*/

var common = require('./common');
var cli_parser = require('./cli-parser');
var cli_executor = require('./cli-executor');
var server = servware();
module.exports = server;

var _updates = [];
function add_update(from, html) {
	var id = _updates.length;
	var update = { id: id, from: from, html: html, created_at: Date.now() };
	_updates.push(update);
	return update;
}

function mapRev(arr, cb) {
	var newarr = [];
	for (var i=arr.length-1; i >= 0; i--) {
		newarr.push(cb(arr[i], i));
	}
	return newarr;
}

function render_updates() {
	return mapRev(_updates, function(update) {
		var time = (new Date(update.created_at)).toLocaleTimeString();//.replace(/\:\d\d /, '');
		// .toLocaleTimeString().split(':').map(function(v,i) { return ((i==1)? ':' : '')+((i==2)? v.slice(3) : v); }).join('');
		// ^ other fun ways to strip seconds
		return [
			'<table>',
				'<tr>',
					'<td><small class="text-muted">'+time+(update.from?('\n'+update.from):'')+'</small></td>',
					'<td>'+update.html+'</td>',
				'</tr>',
			'</table>'
		].join('');
	}).join('');
}

function forbidPeers(req, res) {
	var from = req.header('From');
	if (from && from.indexOf('@') !== -1)
		throw 403;
	return true;
}

function forbidOthers(req, res) {
	var from = req.header('From');
	if (from && from !== 'httpl://'+req.header('Host'))
		throw 403;
	return true;
}

server.route('/', function(link, method) {
	link({ href: 'httpl://hosts', rel: 'via', id: 'hosts', title: 'Page' });
	link({ href: '/', rel: 'self service collection', id: 'feed', title: 'Updates Feed' });
	link({ href: '/{id}', rel: 'item', title: 'Update', hidden: true });

	method('HEAD', forbidPeers, function() { return 204; });

	method('GET', forbidPeers, function(req, res) {
		var today = (''+new Date()).split(' ').slice(1,4).join(' ');
		res.headers.link[1].title = 'Updates: '+today;
		var html = [
			'<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src \'self\'; font-src \'self\'; style-src \'self\'" />',
			'<div class="row">',
				'<div class="col-xs-12">',
					'<form action="/" method="EXEC" target="_null">',
						'<input class="form-control" type="text" name="cmd" />',
					'</form>',
					'<br>',
					'<div id="feed-updates">'+render_updates()+'</div>',
				'</div>',
			'</div>'
		].join('');
		return [200, html, {'content-type': 'text/html'}];
	});

	method('EXEC', forbidOthers, function(req, res) {
		// Validate inputs
		var cmd, cmd_parsed;
		req.assert({ type: ['application/json', 'application/x-www-form-urlencoded', 'text/plain'] });
		if (typeof req.body == 'string') { cmd = req.body; }
		else if (typeof req.body.cmd != 'undefined') { cmd = req.body.cmd; }
		else { throw [422, 'Must pass a text/plain string or an object with a `cmd` string attribute.']; }

		// Parse
		try {
			cmd_parsed = cli_parser.parse(cmd);
		} catch (e) {
			// Parsing error
			add_update(null, e.toString());
			// :TODO: replace with nquery
			$('main iframe').contents().find('#feed-updates').html(render_updates());
			return 204;
		}

		// Execute
		var evts = cli_executor.exec(cmd_parsed);
		var last_res;
		evts.on('response', function(e) { last_res = e.response; });
		evts.on('done', function(e) {
			var res = last_res, html = '';
			if (res.body) {
				if (typeof res.body == 'string') html = res.body;
				else html = JSON.stringify(res.body, null, 4);
			} else {
				html = '<strong>' + res.status + ' ' + res.reason + '</strong>';
			}

			// :DEBUG: output
			add_update(null, html);
			// :TODO: replace with nquery
			$('main iframe').contents().find('#feed-updates').html(render_updates());
		});

		// :DEBUG: output
		/*add_update(null, JSON.stringify(cmd_parsed, null, 4));
		// :TODO: replace with nquery
		$('main iframe').contents().find('#feed-updates').html(render_updates());*/
		return 204;
	});

	method('POST', forbidPeers, function(req, res) {
		req.assert({ type: ['text/html', 'text/plain'] });
		var from = req.header('From');

		var html = req.body;
		var oParser = new DOMParser();
		var oDOM = oParser.parseFromString('<div>'+html+'</div>', "text/html");
		html = oDOM.body.innerHTML;

		var update = add_update(from, html);
		// :TODO: replace with nquery
		$('main iframe').contents().find('#feed-updates').html(render_updates());

		res.setHeader('location', 'httpl://'+req.header('Host')+'/'+update.id);
		return 201;
	});
});

server.route('/:id', function(link, method) {
	link({ href: 'httpl://hosts', rel: 'via', id: 'hosts', title: 'Page' });
	link({ href: '/', rel: 'up service collection', id: 'feed', title: 'Updates Feed' });
	link({ href: '/:id', rel: 'self item', id: ':id', title: 'Update :id' });

	method('HEAD', forbidPeers, function() { return 204; });

	method('GET', forbidPeers, function(req, res) {
		var from = req.header('From');

		var update = _updates[req.params.id];
		if (!update) throw 404;

		if (update.from !== from)
			throw 403;

		var accept = local.preferredType(req, ['text/html', 'application/json']);
		if (accept == 'text/html')
			return [200, html, {'content-type': 'text/html'}];
		if (accept == 'application/json')
			return [200, update, {'content-type': 'application/json'}];
		throw 406;
	});

	method('PUT', forbidPeers, function(req, res) {
		req.assert({ type: ['text/plain', 'text/html'] });
		var from = req.header('From');

		var update = _updates[req.params.id];
		if (!update) throw 404;

		if (update.from !== from)
			throw 403;

		var html = req.body;
		var oParser = new DOMParser();
		var oDOM = oParser.parseFromString('<div>'+html+'</div>', "text/html");
		update.html = oDOM.body.innerHTML;

		// :TODO: replace with nquery
		$('main iframe').contents().find('#feed-updates').html(render_updates());

		return 204;
	});

	method('DELETE', forbidPeers, function(req, res) {
		var from = req.header('From');

		var update = _updates[req.params.id];
		if (!update) throw 404;

		if (update.from !== from)
			throw 403;

		delete _updates[req.params.id];
		return 204;
	});
});