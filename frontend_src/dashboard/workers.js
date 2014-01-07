// workers
// =======

var common = require('./common');

// constants
var default_script_src = "importScripts('http://syncmaildev.grimwire.com/js/local.js');\nimportScripts('http://syncmaildev.grimwire.com/js/servware.js');\n\nvar server = servware();\nlocal.worker.setServer(server);\n\nserver.route('/', function(link, method) {\n    link({ href: '/', rel: 'self via service', title: 'Hello World Worker' });\n\n    method('GET', function(req, res) {\n        return [200, 'Hello, world!'];\n    });\n});";
var whitelist = [ // a list of global objects which are allowed in the worker
	'null', 'self', 'console', 'atob', 'btoa',
	'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
	'Proxy',
	'importScripts',
	'postMessage', 'addEventListener', 'removeEventListener',
	'onmessage', 'onerror'
];
var bootstrap_src = "(function(){ var nulleds=[]; var whitelist = ['"+whitelist.join("', '")+"']; for (var k in self) { if (whitelist.indexOf(k) === -1) { Object.defineProperty(self, k, { value: null, configurable: false, writable: false }); nulleds.push(k); }} console.log('Nullified: '+nulleds.join(', ')); })();\n";

// state
var installed_workers;// = [/* string* */] loaded from local storage
var active_workers = {/* name -> WorkerServer */};
var active_editors = {/* name -> data */};
var editor_id_counter = 0;
var the_active_editor = 0;
var $ace_editor_el = $('#ace');

// load editor
$(window).resize(function () {
	for (var k in active_editors) {
		active_editors[k].$div.height($(window).height() - active_editors[k].$div.offset().top);
	}
});

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

// root
app_local_server.route('/', function(link, method) {
	link({ href: '/', rel: 'self service', id: 'workers', title: 'Worker Programs' });
	link({ href: '/w', rel: 'collection', id: 'w', title: 'Installed' });
	link({ href: '/ed', rel: 'collection', id: 'ed', title: 'Editors' });

	method('GET', function() {
		return 204;
	});
});

// editor collection
app_local_server.route('/ed', function(link, method) {
	link({ href: '/', rel: 'via up service', id: 'workers', title: 'Worker Programs' });
	link({ href: '/ed', rel: 'self collection', id: 'ed', title: 'Editors' });
	link({ href: '/ed/{id}', rel: 'item' });

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
		/*the_active_editor = editor_id_counter++;
		active_editors[the_active_editor] = {
			name: null,
			url: null,
			ua: null,
			ace_session: ace.createEditSession(default_script_src, 'ace/mode/javascript')
		};
		ace_editor.setSession(active_editors[the_active_editor].ace_session);
		renderEditorChrome();
		return 204;*/
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
				active_editors[the_active_editor] = {
					name: name,
					url: url,
					ua: local.agent(url),
					$div: $ace_editor_subdiv,
					ace_editor: ace_editor
				};
				renderEditorChrome();
				return 204;

				/*the_active_editor = editor_id_counter++;
				active_editors[the_active_editor] = {
					name: name,
					url: url,
					ua: local.agent(url),
					ace_session: ace.createEditSession(''+res.body, 'ace/mode/javascript')
				};
				ace_editor.setSession(active_editors[the_active_editor].ace_session);
				renderEditorChrome();
				return 204;*/
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

	method('START', function(req, res) {
		if (!active_editors[the_active_editor]) throw 404;
		return local.dispatch({ method: 'SAVE', url: 'httpl://'+req.host+'/ed' })
			.then(function() { return active_editors[the_active_editor].ua.dispatch({ method: 'START' }); })
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
		return 204;

		/*var id = req.pathArgs.id;
		if (!active_editors[id]) { throw 404; }
		the_active_editor = +id;
		ace_editor.setSession(active_editors[id].ace_session);
		renderEditorChrome();
		return 204;*/
	});
});

// worker collection
app_local_server.route('/w', function(link, method) {
	link({ href: '/', rel: 'via up service', id: 'programs', title: 'Worker Programs' });
	link({ href: '/w', rel: 'self collection', id: 'w', title: 'Installed' });
	link({ href: '/w/{id}', rel: 'item' });
});

// worker item
app_local_server.route('/w/:id', function(link, method) {
	link({ href: '/', rel: 'via service', id: 'programs', title: 'Worker Programs' });
	link({ href: '/w', rel: 'up collection', id: 'w', title: 'Installed' });
	link({ href: '/w/:id', rel: 'self item', id: ':id', title: 'Worker: :id' });

	// CRUD methods

	method('GET', function(req, res) {
		req.assert({ accept: ['application/javascript', 'text/javascript', 'text/plain'] });
		res.setHeader('Content-Type', 'application/javascript');
		return [200, localStorage.getItem('worker_'+req.pathArgs.id) || ''];
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
		active_workers[name] = local.spawnWorkerServer(src, { domain: name }, worker_remote_server);
		// active_workers[name].getPort().addEventListener('error', onError, false); ?

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

		return 204;
	});
});


// Worker Remote Server
// -
var worker_remote_server = function(req, res, worker) {
	if (!req.query.uri) {
		res.setHeader('Link', [
			{ href: '/', rel: 'self service', id: 'host', title: 'Host Application' },
			{ href: 'httpl://0.page?uri=httpl://links{&target}', rel: 'service', id: 'links', title: 'Link System' }
		]);
		return res.writeHead(204).end();
	}

	// :TODO: for now, simple pass-through proxy into the local namespace
	req.on('end', function() {
		var req2 = local.util.deepClone(req);
		req2.url = req.query.uri;
		req2.body = req.body;
		delete req2.query.uri;
		if (req2.query.target) {
			req2.target = req2.query.target;
			delete req2.query.target;
		}
		local.pipe(res, common.dispatchRequest(req2, worker));
	});
};


// Helpers
// -

function renderEditorChrome() {
	var html = '';
	for (var k in active_editors) {
		var name = (active_editors[k].name) ? common.escape(active_editors[k].name) : 'untitled';
		var active = (the_active_editor === +k) ? 'active' : '';
		var glyph = '';
		if (active_workers[name])
			glyph = '<b class="glyphicon glyphicon-play"></b> ';
		html += '<li class="'+active+'"><a href="httpl://workers/ed/'+k+'" method="SHOW" title="'+name+'">'+glyph+name+'</a></li>';
	}
	$('#worker-open-dropdown').html([
		'<li><a method="OPEN" href="httpl://workers/ed">From URL</a></li>',
		installed_workers.map(function(name) {
			return '<li><a method="OPEN" href="httpl://workers/ed?name='+common.escape(encodeURIComponent(name))+'">'+common.escape(name)+'</a></li>';
		}).join('')
	].join(''));
    $('#worker-editor > .nav-tabs').html(html);
}