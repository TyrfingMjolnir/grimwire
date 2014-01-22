/*
httpl://cli

Command Line Interface
*/

var common = require('./common');
var cli_parser = require('./cli-parser');
var cli_executor = require('./cli-executor');
var server = servware();
module.exports = server;

var _updates = {};
var _updates_ids = []; // maintains order
var _updates_idc = 0;
function add_update(from, html, id) {
	id = (id || _updates_idc++);
	if (_updates[id]) {
		_updates[id].html = html;
		_updates[id].from = from;
		return _updates[id];
	}
	_updates[id] = { id: id, from: from, html: html, created_at: Date.now() };
	_updates_ids.push(id);
	return _updates[id];
}
function get_update(id, from) {
	return _updates[id];
}

function mapRev(arr, cb) {
	var newarr = [];
	for (var i=arr.length-1; i >= 0; i--) {
		newarr.push(cb(arr[i], i));
	}
	return newarr;
}

function render_update(id) {
	var update = _updates[id];
	var time = (new Date(update.created_at)).toLocaleTimeString();
	return [
		'<table id="update-'+id+'">',
			'<tr>',
				'<td>',
					'<small class="text-muted">'+time+'</small>',
					'<div class="update-panel">',
						'<a class="glyphicon glyphicon-remove" method="DELETE" href="/'+id+'" title="Delete History" target="_null"></a>',
						//(update.from?(' <small><span class="text-muted">From</span> '+update.from+'</small>'):''),
					'</div>',
				'</td>',
				'<td>'+update.html+'</td>',
			'</tr>',
		'</table>'
	].join('');
}

function render_updates() {
	return mapRev(_updates_ids, render_update).join('');
}

function dom_prepend_update(update) {
	$('main iframe').contents().find('#cli-updates').prepend(render_update(update.id));
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
	link({ href: '/', rel: 'self service collection', id: 'cli', title: 'Command Line' });
	link({ href: '/{id}', rel: 'item', title: 'Update', hidden: true });

	method('HEAD', forbidPeers, function() { return 204; });

	method('GET', forbidPeers, function(req, res) {
		var html = [
			'<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src \'self\'; font-src \'self\'; style-src \'self\'" />',
			'<div class="row">',
				'<div class="col-xs-12">',
					'<form action="/" method="EXEC" target="_null">',
						'<input id="cli-cmd-input" class="form-control" type="text" name="cmd" />',
					'</form>',
					'<br>',
					'<div id="cli-updates">'+render_updates()+'</div>',
				'</div>',
			'</div>'
		].join('');
		return [200, html, {'content-type': 'text/html'}];
	});

	method('EXEC', forbidOthers, function(req, res) {
		// Validate inputs
		var cmd, cmd_parsed, update;
		req.assert({ type: ['application/json', 'application/x-www-form-urlencoded', 'text/plain'] });
		if (typeof req.body == 'string') { cmd = req.body; }
		else if (req.body.cmd) { cmd = req.body.cmd; }
		else { throw [422, 'Must pass a text/plain string or an object with a `cmd` string attribute.']; }

		// Add command to updates
		update = add_update(null, '<em class="text-muted">'+common.escape(cmd)+'</em>');
		dom_prepend_update(update);
		$('main iframe').contents().find('#cli-cmd-input').val(''); // :TODO: nquery

		// Parse
		try {
			cmd_parsed = cli_parser.parse(cmd);
		} catch (e) {
			// Parsing error
			update = add_update(null, e.toString());
			dom_prepend_update(update);
			return 204;
		}

		// Execute
		var cmd_task = cli_executor.exec(cmd_parsed);
		var last_req, last_res;
		cmd_task.on('request', function(cmd) {
			// Set request headers
			cmd.request.header('From', 'httpl://cli');
			cmd.request.header('X-HTML-Context', 'gwr.io/cli gwr.io/rsh');
		});
		cmd_task.on('response', function(cmd) { last_req = cmd.request; last_res = cmd.response; });
		cmd_task.on('done', function(cmd) {
			// Generate final HTML
			var res = last_res, html = '';
			if (res.body) {
				if (typeof res.body == 'string') html = res.body;
				else html = JSON.stringify(res.body, null, 4);
			} else {
				html = '<strong>' + res.status + ' ' + res.reason + '</strong>';
			}

			// Get origin
			var urld = local.parseUri(last_req);
			var origin = (urld.protocol != 'data') ? (urld.protocol || 'httpl')+'://'+urld.authority : null;
			if (last_res.header('X-Origin')) { // verified in response.processHeaders()
				origin = common.escape(last_res.header('X-Origin'));
			}

			// Get ID
			var id;
			if (last_res.header('X-UI-Key')) {
				id = last_res.header('X-UI-Key');
			}

			// Add to history
			update = add_update(origin, '<div class="frame-'+common.frame_nonce+'" data-origin="'+origin+'" data-html-context="gwr.io/cli gwr.io/rsh">'+html+'</div>', id);
			dom_prepend_update(update);
		});
		cmd_task.start();

		return 204;
	});

	method('POST', forbidPeers, function(req, res) {
		req.assert({ type: ['text/html', 'text/plain'] });
		var from = req.header('From');

		var html = req.body;
		var oParser = new DOMParser();
		var oDOM = oParser.parseFromString('<div class="frame-'+common.frame_nonce+'" data-origin="'+from+'">'+html+'</div>', "text/html");
		html = oDOM.body.innerHTML;

		var update = add_update(from, html);
		dom_prepend_update(update);

		res.setHeader('location', 'httpl://'+req.header('Host')+'/'+update.id);
		return 201;
	});
});

server.route('/:id', function(link, method) {
	link({ href: 'httpl://hosts', rel: 'via', id: 'hosts', title: 'Page' });
	link({ href: '/', rel: 'up service collection', id: 'cli', title: 'Command Line' });
	link({ href: '/:id', rel: 'self item', id: ':id', title: 'Update :id' });

	method('HEAD', forbidPeers, function() { return 204; });

	method('GET', forbidPeers, function(req, res) {
		var from = req.header('From');

		var update = get_update(req.params.id, from);
		if (!update) throw 404;

		if (from && update.from !== from && from != 'httpl://cli')
			throw 403;

		var accept = local.preferredType(req, ['text/html', 'application/json']);
		if (accept == 'text/html')
			return [200, html, {'content-type': 'text/html'}];
		if (accept == 'application/json')
			return [200, update, {'content-type': 'application/json'}];
		throw 406;
	});

	/*method('PUT', forbidPeers, function(req, res) {
		req.assert({ type: ['text/plain', 'text/html'] });
		var from = req.header('From');

		var update = get_update(req.params.id, from);
		if (!update) {
			update = add_update(from, html, req.params.id);
		}

		if (update.from && update.from !== from)
			throw 403;

		var html = req.body;
		var oParser = new DOMParser();
		var oDOM = oParser.parseFromString('<div>'+html+'</div>', "text/html");
		update.html = oDOM.body.innerHTML;

		// :TODO: replace with nquery
		$('main iframe').contents().find('#cli-updates').html(render_updates());

		return 204;
	});*/

	method('DELETE', forbidPeers, function(req, res) {
		var from = req.header('From');

		var update = get_update(req.params.id, from);
		if (!update) throw 404;

		if (from && from != 'httpl://cli')
			throw 403;

		delete _updates[update.id];
		_updates_ids.splice(_updates_ids.indexOf(update.id), 1);

		$('main iframe').contents().find('#cli-updates > #update-'+update.id).remove();

		return 204;
	});
});