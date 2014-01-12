// workers
// =======

var common = require('./common');

// constants
var default_script_src = "importScripts('/js/local.js');\nimportScripts('/js/servware.js');\n\nvar server = servware();\nlocal.worker.setServer(server);\n\nserver.route('/', function(link, method) {\n    link({ href: '/', rel: 'self via service', title: 'Hello World Worker' });\n\n    method('GET', function(req, res) {\n        return [200, 'Hello, world!'];\n    });\n});\n/**\n * Be sure to open the tutorials.\n * in the Worker dropdown.\n* (top left!)\n */\n";
var whitelist = [ // a list of global objects which are allowed in the worker
	'null', 'self', 'console', 'atob', 'btoa',
	'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
	'Proxy',
	'importScripts', 'navigator',
	'postMessage', 'addEventListener', 'removeEventListener',
	'onmessage', 'onerror'
];
var whitelistAPIs_src = [ // nullifies all toplevel variables except those listed above in `whitelist`
	'(function() {',
		'var nulleds=[];',
		'var whitelist = ["'+whitelist.join('", "')+'"];',
		'for (var k in self) {',
			'if (whitelist.indexOf(k) === -1) {',
				'Object.defineProperty(self, k, { value: null, configurable: false, writable: false });',
				'nulleds.push(k);',
			'}',
		'}',
		'console.log("Nullified: "+nulleds.join(", "));',
	'})();\n'
].join('');
var importScriptsPatch_src = [ // patches importScripts() to allow relative paths
	'(function() {',
		'var orgImportScripts = importScripts;',
		'importScripts = function() {',
			'return orgImportScripts.apply(null, Array.prototype.map.call(arguments, function(v, i) {',
				'return (v.charAt(0) == \'/\') ? (\''+window.location.origin+'\'+v) : v;',
			'}));',
		'};',
	'})();\n'
].join('');
var bootstrap_src = whitelistAPIs_src + importScriptsPatch_src;

// state
var installed_workers;// = [/* string* */] loaded from local storage
var active_workers = {/* name -> WorkerServer */};
var active_editors = {/* name -> data */};
var editor_id_counter = 0;
var the_active_editor = 0;
var $ace_editor_el = $('#ace');

// load editor
function resizeEditors() {
	for (var k in active_editors) {
		active_editors[k].$div.height($(window).height() - active_editors[k].$div.offset().top);
	}
}
$(window).resize(resizeEditors);

// load workers
try { installed_workers = JSON.parse(localStorage.getItem('workers')) || []; }
catch(e) {}
installed_workers.forEach(function(name) {
	local.dispatch({ method: 'OPEN', url: 'httpl://workers/ed?name='+name });
});
if (installed_workers.length === 0) {
	local.dispatch({ method: 'NEW', url: 'httpl://workers/ed' });
}
renderEditorChrome();


// App Local Server
// -
var app_local_server = servware();
module.exports = app_local_server;
module.exports.active_workers = active_workers;

// root
app_local_server.route('/', function(link, method) {
	link({ href: '/', rel: 'self service', id: 'workers', title: 'Worker Programs' });
	link({ href: '/w', rel: 'collection', id: 'w', title: 'Installed' });
	link({ href: '/ed', rel: 'collection', id: 'ed', title: 'Editors', hidden: true });

	method('GET', function() {
		return 204;
	});
});

// editor collection
app_local_server.route('/ed', function(link, method) {
	link({ href: '/', rel: 'via up service', id: 'workers', title: 'Worker Programs' });
	link({ href: '/ed', rel: 'self collection', id: 'ed', title: 'Editors' });
	link({ href: '/ed/{id}', rel: 'item', title: 'Lookup by ID' });

	method('HEAD', function(req, res) {
		for (var k in active_editors) {
			res.link({ href: '/ed/'+k, rel: 'item', id: k, title: 'Editor '+k });
		}
		return 204;
	});

	// ui methods

	method('NEW', function(req, res) {
		// Hide current editor
		if (active_editors[the_active_editor]) {
			active_editors[the_active_editor].$div.hide();
		}

		// Alocate id
		the_active_editor = editor_id_counter++;

		// Create new editor div
		$ace_editor_subdiv = $('<div id="ace-'+the_active_editor+'">'+default_script_src+'</div>');
		$ace_editor_el.append($ace_editor_subdiv);
		$ace_editor_subdiv.height($(window).height() - $ace_editor_el.offset().top);

		// Create new ace editor
		var ace_editor = ace.edit('ace-'+the_active_editor);
		ace_editor.setTheme("ace/theme/textmate");
		ace_editor.getSession().setMode("ace/mode/javascript");

		// Store
		active_editors[the_active_editor] = {
			name: null,
			url: null,
			ua: null,
			$div: $ace_editor_subdiv,
			ace_editor: ace_editor
		};
		renderEditorChrome();
		return 204;
	});

	method('OPEN', function(req, res) {
		var url = req.query.url, name = req.query.name;
		if (!url && name) url = 'httpl://'+req.host+'/w/'+req.query.name;
		if (!url) url = prompt('Enter the URL of the script');
		if (!url) throw 404;
		if (!name) name = url.split('/').slice(-1)[0];
		if (name.slice(-3) != '.js') name = name + '.js';

		return local.GET({ url: url, Accept: 'application/javascript' })
			.then(function(res) {
				// Hide current editor
				if (active_editors[the_active_editor]) {
					active_editors[the_active_editor].$div.hide();
				}

				// Alocate id
				the_active_editor = editor_id_counter++;

				// Create new editor div
				res.body = common.escape(res.body.replace(/&/g, '&amp;'));
				$ace_editor_subdiv = $('<div id="ace-'+the_active_editor+'">'+res.body+'</div>');
				$ace_editor_el.append($ace_editor_subdiv);
				$ace_editor_subdiv.height($(window).height() - $ace_editor_el.offset().top);

				// Create new ace editor
				var ace_editor = ace.edit('ace-'+the_active_editor);
				ace_editor.setTheme("ace/theme/textmate");
				ace_editor.getSession().setMode("ace/mode/javascript");

				// Store
				url = 'httpl://'+req.host+'/w/'+name; // now store locally
				active_editors[the_active_editor] = {
					name: name,
					url: url,
					ua: local.agent(url),
					$div: $ace_editor_subdiv,
					ace_editor: ace_editor
				};
				renderEditorChrome();
				if (req.query.steal_focus) {
					common.layout.open('west');
				}
				return 204;
			})
			.fail(function(res) {
				alert('Failed to load script: '+res.status+' '+res.reason);
				console.error('Failed to fetch script', res);
				throw 502;
			});
	});

	method('SAVE', function(req, res) {
		var ed = active_editors[the_active_editor];
		if (!ed) { throw 404; }

		if (!ed.name || req.query.rename == 1) {
			var oldname = ed.name, newname;
			while (true) {
				newname = prompt('Enter a name for this worker:', (oldname||''));
				if (!newname) throw 404; // no value given, abort
				if (newname.slice(-3) != '.js') newname = newname + '.js'; // make sure ends with .js
				if (newname != oldname && installed_workers.indexOf(newname) !== -1) {
					if (confirm('The worker "'+newname+'" already exists. Overwrite it?'))
						break; // a good name
				} else
					break; // a good name
			}
			ed.name = newname;
			ed.url = 'httpl://'+req.host+'/w/'+encodeURIComponent(common.escape(newname));
			ed.ua = local.agent(ed.url);
		}

		return ed.ua.PUT(ed.ace_editor.getValue()||'', { Content_Type: 'application/javascript' })
			.then(function(res) { renderEditorChrome(); return 204; })
			.fail(function(res) {
				console.error('Failed to store script', res);
				throw 502;
			});
	});

	method('CLOSE', function(req, res) {
		if (!active_editors[the_active_editor]) throw 404;
		active_editors[the_active_editor].ace_editor.destroy();
		active_editors[the_active_editor].$div.remove();
		delete active_editors[the_active_editor];

		new_active_editor = Object.keys(active_editors).slice(-1)[0];
		local.dispatch({ method: 'SHOW', url: 'httpl://'+req.host+'/ed/'+new_active_editor });

		return 204;
	});

	method('DELETE', function(req, res) {
		if (!active_editors[the_active_editor]) throw 404;
		if (!confirm('Delete '+active_editors[the_active_editor].name+'. Are you sure?')) throw 400;
		active_editors[the_active_editor].ua.DELETE();
		local.dispatch({ method: 'CLOSE', url: 'httpl://'+req.host+'/ed' });

		return 204;
	});

	method('START', function(req, res) {
		if (!active_editors[the_active_editor]) throw 404;
		return local.dispatch({ method: 'SAVE', url: 'httpl://'+req.host+'/ed' })
			.then(function() { return active_editors[the_active_editor].ua.dispatch({ method: 'START', query: { network: req.query.network } }); })
			.then(function() { renderEditorChrome(); return 204; })
			.fail(function(res) { console.error('Failed to start worker', req, res); throw 502; });
	});

	method('STOP', function(req, res) {
		if (!active_editors[the_active_editor]) throw 404;
		return active_editors[the_active_editor].ua.dispatch({ method: 'STOP' })
			.then(function(res) { renderEditorChrome(); return 204; })
			.fail(function(res) { console.error('Failed to stop worker', req, res); throw 502; });
	});
});

// editor item
app_local_server.route('/ed/:id', function(link, method) {
	link({ href: '/', rel: 'via service', id: 'workers', title: 'Worker Programs' });
	link({ href: '/ed', rel: 'up collection', id: 'ed', title: 'Editors' });
	link({ href: '/ed/:id', rel: 'self item', id: ':id', title: 'Editor :id' }); // :TODO: uri templates

	// UI methods

	method('SHOW', function(req, res) {
		var id = req.pathArgs.id;
		if (!active_editors[id]) { throw 404; }
		if (active_editors[the_active_editor])
			active_editors[the_active_editor].$div.hide();
		the_active_editor = +id;
		active_editors[the_active_editor].$div.show();
		renderEditorChrome();
		resizeEditors();
		if (req.query.steal_focus) {
			common.layout.toggle('west');
		}
		return 204;
	});
});

// worker collection
app_local_server.route('/w', function(link, method) {
	link({ href: '/', rel: 'via up service', id: 'programs', title: 'Worker Programs' });
	link({ href: '/w', rel: 'self collection', id: 'w', title: 'Installed' });
	link({ href: '/w/{id}', rel: 'item', title: 'Lookup by Name' });

	method('HEAD', function(req, res) {
		installed_workers.forEach(function(name) {
			res.link({ href: '/w/'+name, rel: 'item', id: name, title: name });
		});
		return 204;
	});
});

// worker item
app_local_server.route('/w/:id', function(link, method) {
	link({ href: '/', rel: 'via service', id: 'programs', title: 'Worker Programs' });
	link({ href: '/w', rel: 'up collection', id: 'w', title: 'Installed' });
	link({ href: '/w/:id', rel: 'self item', id: ':id', title: 'Worker: :id' });

	// CRUD methods

	method('HEAD', function(req, res) {
		var js = localStorage.getItem('worker_'+req.pathArgs.id);
		if (!js) throw 404;
		return 204;
	});

	method('GET', function(req, res) {
		req.assert({ accept: ['application/javascript', 'text/javascript', 'text/plain'] });
		var js = localStorage.getItem('worker_'+req.pathArgs.id);
		if (!js) throw 404;
		res.setHeader('Content-Type', 'application/javascript');
		return [200,  js];
	});

	method('PUT', function(req, res) {
		var name = req.pathArgs.id;
		req.assert({ type: ['application/javascript', 'text/javascript', 'text/plain'] });
		localStorage.setItem('worker_'+name, req.body || '');
		if (installed_workers.indexOf(name) === -1) {
			installed_workers.push(name);
			localStorage.setItem('workers', JSON.stringify(installed_workers));
		}
		return 204;
	});

	method('DELETE', function(req, res) {
		var name = req.pathArgs.id;

		// stop worker
		local.dispatch({ method: 'STOP', url: 'programs/w/'+name });

		// update listing
		var name_index = installed_workers.indexOf(name);
		if (name_index !== -1) {
			installed_workers.splice(name_index, 1);
			localStorage.setItem('workers', JSON.stringify(installed_workers));
		}

		// update script
		localStorage.removeItem('worker_'+name);

		return 204;
	});

	// Worker control methods

	method('START', function(req, res) {
		var name = req.pathArgs.id;

		// Unload script if active
		if (active_workers[name]) {
			active_workers[name].terminate();
			local.removeServer(name);
		}

		// (Try to) Load script from localstorage
		var script = localStorage.getItem('worker_'+name) || '';

		// Prepend bootstrap script and convert to a URI
		// var src = 'data:text/javascript;charset=US-ASCII,' + encodeURIComponent(script);
		// ^ https://code.google.com/p/chromium/issues/detail?id=270979
		var scriptblob = new Blob([bootstrap_src+'(function(){'+script+'})();']);
		var src = URL.createObjectURL(scriptblob);

		// Spawn server
		active_workers[name] = local.spawnWorkerServer(src, { domain: name, on_network: !!(req.query.network) }, worker_remote_server);
		// active_workers[name].getPort().addEventListener('error', onError, false); ?
		common.publishNetworkLinks();

		return 204;
	});

	method('STOP', function(req, res) {
		var name = req.pathArgs.id;

		// Unload script if active
		if (active_workers[name]) {
			active_workers[name].terminate();
			local.removeServer(name);
		}
		delete active_workers[name];
		common.publishNetworkLinks();

		return 204;
	});
});


// Worker Remote Server
// -
var worker_remote_server = function(req, res, worker) {
	if (!req.query.uri) {
		res.setHeader('Link', [
			{ href: '/{?uri}', rel: 'self service', title: 'Host Application' },
			{ href: '/?uri=httpl://hosts', rel: 'service', id: 'hosts', title: 'Page Hosts' }
		]);
		return res.writeHead(204).end();
	}

	// :TODO: for now, simple pass-through proxy into the local namespace
	var req2 = new local.Request({
		method: req.method,
		url: req.query.uri,
		headers: local.util.deepClone(req.headers),
		stream: true
	});
	req2.headers['From'] = worker.config.domain;
	var res2_ = local.dispatch(req2)
	res2_.always(function(res2) {
		res.writeHead(res2.status, res2.reason, res2.headers);
		res2.on('data', function(chunk) { res.write(chunk); });
		res2.on('end', function() { res.end(); });
		res2.on('close', function() { res.close(); });
	});
	req.on('data', function(chunk) { req2.write(chunk); });
	req.on('end', function() { req2.end(); });
};


// Worker Local Request Patch
// - modifies requests sent to the workers
local.WorkerBridgeServer.prototype.handleLocalRequest = function(request, response) {
	if (request.headers['X-Public-Host']) {
		request.headers['X-Public-Host'] = local.joinUri(request.headers['X-Public-Host'], request.host);
	}
	local.BridgeServer.prototype.handleLocalRequest.call(this, request, response);
};

// Helpers
// -

function renderEditorChrome() {
	var html = '';
	for (var k in active_editors) {
		var name = (active_editors[k].name) ? common.escape(active_editors[k].name) : 'untitled';
		var active = (the_active_editor === +k) ? 'active' : '';
		var glyph = '';
		if (active_workers[name]) {
			glyph = '<b class="glyphicon glyphicon-play"></b> ';
			if (active_workers[name].config.on_network) {
				glyph += '<b class="glyphicon glyphicon-globe"></b> ';
			}
		}
		if (installed_workers.indexOf(name) === -1) {
			name += '*'; // unsaved
		}
		html += '<li class="'+active+'"><a href="httpl://workers/ed/'+k+'" method="SHOW" title="'+name+'">'+glyph+name+'</a></li>';
	}
	if (active_editors[the_active_editor]) {
		$('#worker-inst-link').attr('href', 'httpl://'+active_editors[the_active_editor].name);
	}
	$('#worker-open-dropdown').html([
		'<li><a method="OPEN" href="httpl://workers/ed">From URL</a></li>',
		installed_workers.map(function(name) {
			return '<li><a method="OPEN" href="httpl://workers/ed?name='+common.escape(encodeURIComponent(name))+'">'+common.escape(name)+'</a></li>';
		}).join('')
	].join(''));
    $('#worker-editor > .nav-tabs').html(html);
}