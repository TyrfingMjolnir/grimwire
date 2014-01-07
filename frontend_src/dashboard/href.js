/*
A PouchDB wrapper for persisting and syncing links.
 - Links are immutable once created
   - This is because they are often shared among multiple environments, and agreeing that a GUID refers to
     a fixed link object makes reasoning simpler
   - For instance, if a GUID is present, it does not need to be synced
 - Links are wrapped in a mutable object of env state, which includes (for syncmail):
   - id*: a GUID (immutable)
   - parent_id: if link is a reply, the GUID of the parent link (immutable)
   - thread_id: if link is a reply, the GUID of the link that started the conversation (immutable)
   - folders*: an array of folders (string ids) which the link belongs to
   - author*: the network id (user@network) of the link's author
   - date*: the numeric timestamp of creation by author
   - is_read: has the local user read it
   - is_deleted: has the local user deleted it (like being in the recycle bin, not yet permadeleted)
   - link: the link object (immutable)
     - href*
     - rel*
     - id
     - title
     - ...
 - Folders are a view-producing semantic which mimic traditional folders
   - There is no tree data-structure; data is stored in a flat p/couchdb document store
   - Instead, views are produced by using the path as a filter to mimic a file-tree
   - This means:
     - Links can have multiple folders (because why not?)
     - Views can be constructed from multiple folders (because why not!?)
     - Link IDs are globally unique
 - GUIDs are <network_id>.<timestamp>.<random>, so something like "pfraze@grimwire.net.1388076378683.12345"
*/

var common = require('./common');
var db = new PouchDB('linkstore');

var server = servware();
module.exports = server;

server.route('/', function(link, method) {
	link({ href: 'httpl://hosts', rel: 'via', id: 'hosts', title: 'Page' });
	link({ href: '/{?type}', rel: 'self service collection gwr.io/folder', id: 'href', title: 'Link System' });
	// link({ href: '/{id}', rel: 'item gwr.io/link', title: 'Lookup Link by ID', hidden: true });
	link({ href: 'https://gwr.io/folder', rel: 'gwr.io/rel', title: 'Folder', hidden: true });
	link({ href: 'https://gwr.io/datauri', rel: 'gwr.io/rel', title: 'File', hidden: true });
	link({ href: '/#TODO', rel: 'item collection gwr.io/folder', id: 'reltypes', title: 'Relation Types' });
	link({ href: '/?type=gwr.io/shared', rel: 'item collection gwr.io/folder', id: 'hrefs', title: 'Shared Items' });

	method('GET', function(req, res) {
		var type = req.query.type || false;

		var linkMapReduce = {
			map: function(doc) {
				if (!doc.rel) return;
				doc.rel.split(' ').forEach(function(rel) {
					emit(rel, doc);
				});
			},
			reduce: false
		};

		var p = local.promise();
		db.query(linkMapReduce, { descending: true, key: type }, p.cb.bind(p));
		p.always(function(links) {
			res.headers['link'] = res.headers['link']
				.concat(links.rows.map(function(item) {
					// Supply indirect links to data uris (dont put them in the index)
					if (item.value.href.indexOf('data:') === 0) {
						item.value.href = '/'+item.id;
					}
					return item.value;
				}));
			res.writeHead(204).end();
		});
	});

	method('POST', function(req, res) {
		// Validate request
		if (req.headers['content-type'] != 'application/json' && req.headers['content-type'] != 'application/x-www-form-urlencoded')
			throw 415;

		var body = req.body || {}, errors = {};
		if (!body.href || typeof body.href != 'string') { errors.href = 'Required.'; }
		if (!body.rel || typeof body.rel != 'string') { errors.rel = 'Required.'; }
		if (Object.keys(errors).length > 0) {
			throw [422, errors, {'Content-Type': 'application/json'}];
		}

		// Massage data
		body.rel = common.normalizeRel(body.rel);
		body.href = common.normalizeUri(body.href);
		body.href = local.UriTemplate.parse(body.href).expand({});
		if (body.href.indexOf('data:') === 0) {
			body.rel += ' gwr.io/datauri';
		}

		// Add to folder
		return common.addMessage(db, body).then(function() { return 204; });
	});
});

server.route('/edit', function(link, method) {
	link({ href: '/{?folder}', rel: 'up service collection gwr.io/folder', id: 'href', title: 'Link System' });
	link({ href: '/edit', rel: 'self', id: 'edit', title: 'Edit Interface' });

	method('GET', function(req, res) {
		var accept = local.preferredType(req, 'text/html');
		if (!accept) { throw 406; }

		// Standardize href
		req.query.href = common.normalizeUri(req.query.href);

		var linkMapReduce = {
			map: function(doc) {
				if (!doc.href) return;
				emit(doc.href, doc);
			},
			reduce: false
		};

		db.query(linkMapReduce, { descending: true, key: req.query.href }, function(err, links) {
			res.writeHead(200, 'Ok', { 'content-type': 'text/html' });
			res.end([
				'<p class="title"><span class="glyphicon glyphicon-bookmark"></span> Semantic Links</p>',
				'<p>'+links.rows.map(function(item) {
					return '<a href="httpl://'+req.host+'/edit/'+item.value._id+'" target="_content">'+item.value.rel+'</a>';
				}).join(', ')+'</p>',
				'<p><a class="btn btn-sm btn-default action glyphbg glyphicon-plus" href="httpl://'+req.host+'/edit/new?href='+encodeURIComponent(req.query.href)+'" target="_card_group">add relationship</a></p>',
			].join(''));
		});
	});
});

server.route('/edit/:id', function(link, method) {
	link({ href: '/{?folder}', rel: 'via service collection gwr.io/folder', id: 'href', title: 'Link System' });
	link({ href: '/edit', rel: 'up', id: 'edit', title: 'Edit Interface' });
	link({ href: '/edit/:id', rel: 'self', id: ':id', title: 'Edit :id' });

	method('GET', function(req, res) {
		var accept = local.preferredType(req, 'text/html');
		if (!accept) throw 406;

		var id = req.pathArgs.id;
		if (id == 'new') {
			if (!req.query.rel) {
				// Need to select a reltype
				var localHosts = local.getServers();
				var responses_ = [], domains = [];
				for (var domain in localHosts) {
					if (domain == 'hosts')
						continue;
					domains.push(domain);
					responses_.push(local.dispatch({ method: 'HEAD', url: 'httpl://'+domain }));
				}
				local.promise.bundle(responses_).then(function(ress) {
					var html = '';
					ress.forEach(function(res2, i) {
						var selfLink = local.queryLinks(res2, { rel: 'self' })[0];
						var relLinks = local.queryLinks(res2, { rel: 'gwr.io/rel' });
						if (!relLinks.length) return;
						if (!selfLink) selfLink = { title: domains[i] };
						html += '<p class="title">'+selfLink.title + '</p>';
						relLinks.forEach(function(link) {
							var uri = 'httpl://'+req.host+'/edit/new'+
								'?rel='+encodeURIComponent(link.href)+
								'&rel_title='+encodeURIComponent(link.title)+
								'&href='+encodeURIComponent(req.query.href);
							html += '<p><a class="btn btn-sm btn-default" href="'+uri+'" target="_content">is a '+link.title+'</a> <small class="text-muted">'+link.href+'</small></p>';
						});
					});
					res.writeHead(200, 'Ok', { 'content-type': 'text/html' });
					res.end(html);
				});
			} else if (req.query.for === 0) {
				var uri = 'httpl://'+req.host+'/edit/new'+
					'?rel='+encodeURIComponent(req.query.rel)+
					'&rel_title='+encodeURIComponent(req.query.rel_title)+
					'&href='+encodeURIComponent(req.query.href);
				res.writeHead(200, 'Ok', { 'content-type': 'text/html' }).end([
					// :TODO: load this from somewhere dynamic
					'<p><a class="btn btn-sm btn-default" href="'+uri+'&for=Family" target="_content">for Family</a> <small class="text-muted">nav:||files|gwr.io/friend</small></p>',
					'<p><a class="btn btn-sm btn-default" href="'+uri+'&for=Friends" target="_content">for Friends</a> <small class="text-muted">nav:||files|gwr.io/friend</small></p>',
					'<p><a class="btn btn-sm btn-default" href="'+uri+'&for=Your%20Network" target="_content">for Your Network</a> <small class="text-muted">nav:||network|gwr.io/users|item</small></p>',
					'<p><a class="btn btn-sm btn-default" href="'+uri+'&for=Anybody" target="_content">for Anybody</a> <small class="text-muted">nav:||</small></p>',
				].join(''));
			} else {
				local.HEAD(req.query.href).always(function(res2) {
					var relTitle = req.query.rel_title || req.query.rel;
					var selfLink = local.queryLinks(res2, { rel: 'self' })[0];
					if (!selfLink) selfLink = { href: req.query.href, title: req.query.href };
					res.writeHead(200, 'Ok', { 'content-type': 'text/html' });
					var uri = 'httpl://'+req.host+'/edit/new'+
						'?rel='+encodeURIComponent(req.query.rel)+
						'&rel_title='+encodeURIComponent(relTitle)+
						'&href='+encodeURIComponent(selfLink.href);
					var fortext = (req.query.for) ? (' for '+req.query.for) : ''; // :TODO: temporary until real "for" mechanism is done
					res.end([
						'<p class="title"><strong>'+selfLink.title+'</strong> is a '+relTitle+fortext+'</p>',
						'<a class="btn btn-sm btn-default action glyphbg glyphicon-ok-sign" href="'+uri+'" method="PUT" target="_content">do it</a>',
						((req.query.for) ? '' : '<a class="btn btn-sm btn-default action glyphbg glyphicon-lock" href="'+uri+'&for=0" target="_card_self">set audience</a>')
					].join(''));
				});
			}
		} else {
			var uri = 'httpl://'+req.host+'/edit/'+id;
			if (req.query.prompt == 'delete') {
				res.writeHead(200, 'Ok', { 'content-type': 'text/html' });
				res.end([
					'<p><strong>Are you sure?</strong></p>',
					'<a class="btn btn-sm btn-default action glyphbg glyphicon-ok-sign" href="'+uri+'" method="DELETE" target="_content">delete it</a>'
				].join(''));
			} else {
				db.get(id, function(err, doc) {
					if (err && err.not_found) { return res.writeHead(404, 'Not Found').end(); }
					if (err) { return res.writeHead(500, 'Internal Error', { 'content-type': 'application/json' }).end(err); }
					delete doc._id; delete doc._rev; // clean up a bit
					res.writeHead(200, 'Ok', { 'content-type': 'text/html' });
					res.end([
						'<pre>'+(JSON.stringify(doc).replace(/</g, '&lt;').replace(/>/g, '&gt;'))+'</pre>',
						'<a class="btn btn-sm btn-default action glyphbg glyphicon-remove-sign" href="'+uri+'?prompt=delete" target="_content">delete</a>'
					].join(''));
				});
			}
		}
	});

	method('PUT', function(req, res) {
		var accept = local.preferredType(req, 'application/json');
		if (!accept) { throw 406; }

		if (!req.query.rel || !req.query.href) {
			throw [400, { rel: 'Required', href: 'Required' }, {'content-type': 'application/json'}];
		}
		var id = req.pathArgs.id;

		function fetchLink() {
			local.HEAD(req.query.href).always(function(res2) {
				// Find the self link
				var selfLink = local.queryLinks(res2, { rel: 'self' })[0];
				if (!selfLink) {
					selfLink = { href: req.query.href, rel: '' };
				}

				// Standardize both rel and href
				var rel = common.normalizeRel(req.query.rel);
				selfLink.href = common.normalizeUri(req.query.href); // :NOTE: using the client-supplied href, not the self link's href
				selfLink.href = local.UriTemplate.parse(selfLink.href).expand({});

				// Add our new rel
				if (!local.queryLink(selfLink, { rel: rel })) {
					selfLink.rel = rel+' '+selfLink.rel; // up front so we know it's user-set
				}

				// Strip out non-URI rels
				selfLink.rel = selfLink.rel.replace(/(^|\s)([^\.\/]*)(\s|$)/g, ' ').trim();
				saveDoc(selfLink);
			});
		}

		function saveDoc(doc) {
			if (!doc._id) {
				// :TODO: user current network id
				doc._id = 'todo@grimwire.net' + ',' + Date.now() + ',' + Math.round(Math.random()*10000);
			}
			db.put(doc, function(err) {
				if (err) return res.writeHead(500, 'Internal Error', { 'content-type': 'application/json' }).end(err);
				return res.writeHead(200, 'Ok', { 'content-type': 'application/json' }).end({ done: true });
			});
		}

		// Try to fetch link from DB, or do a HEAD request
		if (id == 'new') {
			fetchLink();
		} else {
			db.get(id, function(err, doc) {
				if (!err) return saveDoc(doc);
				if (err.not_found) return fetchLink();
				res.writeHead(500, 'Internal Error', { 'content-type': 'application/json' }).end(err);
			});
		}
	});

	method('DELETE', function(req, res) {
		var id = req.pathArgs.id;
		db.get(id, function(err, doc) {
			if (err && err.not_found) { return res.writeHead(404, 'Not Found').end(); }
			if (err) { return res.writeHead(500, 'Internal Error', { 'content-type': 'application/json' }).end(err); }
			db.remove(doc, function(err) {
				if (err) { return res.writeHead(500, 'Internal Error', { 'content-type': 'application/json' }).end(err); }
				res.writeHead(204, 'Ok, no content').end();
			});
		});
	});
});

function linkRoute(req, res) {
	res.headers['link'] = [
		{ href: '/{?folder}', rel: 'up service collection gwr.io/folder', id: 'href', title: 'Link System' }
	];

	if (req.method == 'HEAD' || req.method == 'GET') {
		return GETlinkRoute(req, res);
	}
	res.writeHead(405, 'Bad Method').end();
}

function GETlinkRoute(req, res) {
	db.get(decodeURIComponent(req.path.slice(1)), function(err, doc) {
		if (err) {
			if (err.status == 404) { return res.writeHead(404).end(); }
			return res.writeHead(500, 'internal error', {'Content-Type': 'application/json'}).end(err);
		}

		// Add link to header
		var href = doc.link.href;
		if (href.indexOf('data:') === 0) {
			doc.link.href = req.path; // dont put data URIs directly in - point to this route
		}
		doc.link.rel += ' self';
		res.headers['link'].push(doc.link);

		// Stop here for head requests
		if (req.method == 'HEAD') { return res.writeHead(204).end(); }

		// Generate response
		var accept = local.preferredType(req, ['*/*']);
		var body;
		if (accept == 'application/json') {
			body = doc;
		} else {
			if (href.indexOf('data:') === 0) {
				var parts = href.split(',');
				body = parts.slice(1).join(',');
				var type = /:([A-z\/]+)/.exec(parts.slice(0,1));
				if (type) { accept = type[1]; }
			} else {
				body = '<a href="'+href+'">'+doc.link.href+'</a>';
			}
		}
		res.writeHead(200, 'OK', { 'Content-Type': accept }).end(body);
	});
}

/*server.route('/', function(link, method) {
	link({ href: '/{?type,folder}', rel: 'self service via collection mail.gwr.io/linkstore', id: 'linkstore', title: 'Link System' });
	link({ href: '/{id}', rel: 'item mail.gwr.io/link', title: 'Lookup Link by ID', hidden: true });

	function addHostsLinks(req, res) {
		if (req.query.folder) { return true; }

		var localHosts = local.getServers();
		var responses_ = [];
		var domains = [], links = [];
		for (var domain in localHosts) {
			if (domain == 'hosts' || domain == 'links')
				continue;
			domains.push(domain);
			responses_.push(local.dispatch({ method: 'HEAD', url: 'httpl://'+domain }));
		}

		return local.promise.bundle(responses_).then(function(ress) {
			ress.forEach(function(res, i) {
				var selfLink = local.queryLinks(res, { rel: 'self' })[0];
				if (!selfLink) {
					selfLink = { rel: 'service', id: domains[i], href: 'httpl://'+domains[i] };
				}
				selfLink.rel = (selfLink.rel) ? selfLink.rel.replace(/(^|\s)self(\s|$)/i, '') : 'service';
				links.push(selfLink);
			});

			res.link(links);
			return true;
		});
	}

	method('HEAD', addHostsLinks, function() { return 204; });
	method('GET', addHostsLinks, function(req, res) {
		var accept = local.preferredType(req, ['text/html', 'application/json']);
		if (!accept) throw 406;

		if (accept == 'text/html') {
			var query = { type: 'link' };
			if (req.query.folder) query.folder = req.query.folder;
			return local.dispatch({ url: 'httpl://'+req.host, query: req.query, Accept: 'application/json' })
				.then(function(res2) {
					var html = tmpl.folder({
						folder: 'Link System / '+((req.query.folder) ? req.query.folder : '*'),
						links: res2.body.rows,
						base_uri: req.host,
						last_sync: +localStorage.getItem('last_sync'),
						has_session: true,
						// has_session: !!relay.getUserId(), :TODO:
					});
					return [200, html, {'Content-Type': 'text/html'}];
				})
				.fail(function(res2) { console.error('Failed to fetch folders', req, res2); throw 502; });
		}

		var fn = { map: false, reduce: false }, opts = { descending: true };
		if (req.query.type == 'folder') {
			fn.map = function(doc) {
				if (doc.is_deleted) { return; }
				if (!doc.folders) { return; }
				doc.folders.forEach(function(folder) {
					emit(folder, 1);
				});
			};
			fn.reduce = function(keys, values) {
				return keys.length;
			};
		}
		else { // type == 'link'
			if (req.query.folder) {
				fn.map = function(doc) {
					if (doc.is_deleted) { return; }
					if (!doc.folders) { return; }
					doc.folders.forEach(function(folder) {
						emit([folder, doc.date], doc);
					});
				};
				opts.startkey = [req.query.folder];
				opts.endkey = [req.query.folder, {}];
			} else {
				fn.map = function(doc) {
					if (doc.is_deleted) { return; }
					doc.folders.forEach(function(folder) {
						emit([folder, doc.date], doc);
					});
				};
			}
		}

		var p = local.promise();
		db.query(fn, opts, function(err, r) {
			if (err) { return p.reject([500, err]); }
			p.fulfill([200, { rows: r.rows }, { 'Content-Type': 'application/json' }]);
		});
		return p;
	});

	method('POST', function(req, res) {
		// Validate request
		req.assert({ type: ['application/json', 'application/x-www-form-urlencoded'] });
		var body = req.body || {}, errors = {};
		if (!body.folders) { errors.folders = 'Required.'; }
		if (!body.link || !body.link.href || typeof body.link.href != 'string') { errors.link = 'Required.'; }
		if (Object.keys(errors).length > 0) { throw [422, errors]; }

		// Massage data
		if (!Array.isArray(body.folders)) body.folders = [body.folders];

		// Construct record
		var msg = {
			folders: body.folders,
			author: common.getSessionEmail(),
			date: Date.now(),
			is_read: true, // dont show as unread in the outbox
			link: body.link
		};
		if (body.thread_id) { msg.thread_id = body.thread_id; }
		if (body.parent_id) { msg.parent_id = body.parent_id; }

		// Add to folder
		return common.addMessage(db, msg).then(function() { return 204; });
	});

	// :TODO: - reenable when the dust settles
	/*method('SYNC', common.getDb, function(req, res) {
		var accept = local.preferredType(req, ['text/plain', 'text/event-stream']);
		var successes = 0;

		// For now, only allow on the inbox
		if (req.pathArgs.db != 'inbox') throw 403;

		// Get sources
		var sources = common.getSources();
		if (!sources.length) {
			return res.writeHead(204).end();
		}

		// Handler for received data
		function handleNewMessages(res2) {
			if (res2.status != 200 || !res2.body) return;
			successes++;

			// Collect received docs into a bulk update
			var docs = res2.body.results.map(function(result) {
				delete result.doc._rev; // Strip _rev so that only additions come in
				result.doc.is_read = false;
				return result.doc;
			});
			if (docs.length === 0) {
				if (accept == 'text/event-stream') {
					res.write({ event: 'srcend', data: { sourceIndex: res2.sourceIndex } });
				}
				return res2;
			}
			db.bulkDocs({ docs: docs }, function(err) {
				if (err) { console.error('Failed to add docs', err); }
				if (accept == 'text/event-stream') {
					res.write({ event: 'srcupdate', data: { sourceIndex: res2.sourceIndex } });
					res.write({ event: 'srcend', data: { sourceIndex: res2.sourceIndex } });
				}
			});

			return res2;
		}

		// Handler for unreachable contact
		function handleFail(res2) {
			if (accept == 'text/event-stream') {
				res.write({ event: 'srcfail', data: { sourceIndex: res2.sourceIndex } });
			}
			throw res2;
		}

		// Setup event stream
		if (accept == 'text/event-stream') {
			res.writeHead(200, 'ok', { 'content-type': 'text/event-stream' });
		}

		// Fetch changes for each source
		relay.agent().head().then(function(res2) {
			var ress_ = [];
			sources.forEach(function(source, sourceIndex) {
				// Get the links for this source
				var links = local.queryLinks(res2, {
					rel: 'mail.gwr.io',
					host_user: source.host_user,
					host_relay: source.host_relay,
					host_app: window.location.hostname
				});

				// Pull changes from each device
				var deviceLinks = {};
				links.forEach(function(link) {
					// Reduce to 1 pull per device
					var deviceSid = link.host_sid - link.host_sid % 100;
					if (deviceLinks[deviceSid]) { return; }
					deviceLinks[deviceSid] = true;

					// Fetch changes
					console.log('syncing with', link.href);
					if (accept == 'text/event-stream') {
						res.write({ event: 'srcstart', data: { sourceIndex: sourceIndex } });
					}
					var res_ = local.agent(link.href)
						.follow({ rel: 'mail.gwr.io/changes', id: 'outbox' })
						.get({ timeout: 15000 })
						.then(
							function(res3) {
								// Tag the result with the source index so it can update
								res3.sourceIndex = sourceIndex;
								console.debug('data from', link.href, res3.status, res3.body);
								return res3;
							},
							function(res3) { res3.sourceIndex = sourceIndex; throw res3; }
						)
						.then(handleNewMessages)
						.fail(handleFail);
					ress_.push(res_);
				});
				if (accept == 'text/event-stream') {
					res.write({ event: 'started' });
				}
			});

			// Handle finish
			local.promise.bundle(ress_).always(function() {
				// Update the sync time if there were any successful updates
				if (successes > 0) {
					localStorage.setItem('last_sync', Date.now());
				}

				// Finish the response
				if (accept != 'text/event-stream') {
					res.writeHead(204);
				} else {
					res.write({ event: 'end' });
				}
				res.end();
			});
		});
	});
});

server.route('/:id', function(link, method) {
	link({ href: '/{?folder}', rel: 'up service via collection mail.gwr.io/linkstore', id: 'linkstore', title: 'Link System' });
	link({ href: '/:id', rel: 'self item mail.gwr.io/link', id: ':id' });

	method('GET', function(req, res) {
		var accept = local.preferredType(req, ['text/html', 'application/json']);
		if (!accept) throw 406;

		var p = local.promise();
		db.get(decodeURIComponent(req.pathArgs.id), function(err, doc) {
			if (err) { return p.reject([500, err]); }

			var body;
			if (accept == 'text/html') {
				if (doc.link.href.indexOf('data:') == 0) {
					body = doc.link.href.split(',').slice(1).join(',');
				} else {
					body = '<a href="'+doc.link.href+'">'+doc.link.href+'</a>';
				}
			} else {
				body = { item: doc, folder: req.pathArgs.db };
			}
			p.fulfill([200, body, { 'Content-Type': accept }]);
		});
		return p;
	});

	method('MOVE', function(req, res) {
		req.assert({ type: 'application/json' });
		if (req.body && typeof req.body == 'string' || Array.isArray(req.body)) {
			return common.updateDoc(db, req.pathArgs.id, { folders: req.body });
		}
		throw [422, { _body: 'Required.' }];
	});

	method('DELETE', function(req, res) {
		return common.updateDoc(db, req.pathArgs.id, { is_deleted: true });
	});

	method('MARKREAD',function(req, res) {
		return common.updateDoc(db, req.pathArgs.id, { is_read: true });
	});

	method('MARKUNREAD', function(req, res) {
		return common.updateDoc(db, req.pathArgs.id, { is_read: false });
	});
});*/