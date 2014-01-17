/*
httpl://explorer

The Link Explorer
 - Renders indexes exported by hosts with the directory protocol
*/


var common = require('./common');

var server = servware();
module.exports = server;

var show_hidden = false;

function forbidAll(req, res) {
	// Nobody allowed but the page
	var from = req.header('From');
	if (from && from != 'httpl://explorer')
		throw 403;
	return true;
}

server.route('/', function(link, method) {
	link({ href: 'httpl://hosts', rel: 'via', id: 'hosts', title: 'Page' });
	link({ href: '/', rel: 'self service', id: 'explorer', title: 'Explorer' });
	link({ href: '/intro', rel: 'service gwr.io/page', id: 'intro', title: 'About' });

	method('HEAD', forbidAll, function() { return 204; });
	method('GET', forbidAll, function(req, res) {
		if (typeof req.query.show_hidden != 'undefined')
			show_hidden = (req.query.show_hidden == 1);
		var uri = req.query.uri || 'httpl://hosts';
		var uritmpl = local.UriTemplate.parse(uri);
		var ctx = {};
		uritmpl.expressions.forEach(function(expr) {
			if (expr.operator && expr.operator.symbol == '') {
				// This is a path token, ask for values
				expr.varspecs.forEach(function(varspec) {
					ctx[varspec.varname] = prompt(varspec.varname);
					if (ctx[varspec.varname] === null) throw 205; // aborted, reset view
				});
			}
		});
		uri = uritmpl.expand(ctx);
		local.HEAD({ url: uri, From: 'explorer' }).always(function(res2) {
			// Build explore interface
			var links = (res2.parsedHeaders.link) ? res2.parsedHeaders.link : [];
			var viaLink = local.queryLinks(links, { rel: 'via !up !self' })[0];
			var upLink = local.queryLinks(links, { rel: 'up !self' })[0];
			var selfLink = local.queryLinks(links, { rel: 'self' })[0];
			if (!viaLink && (!selfLink || selfLink.host_domain != 'hosts')) {
				viaLink = { href: 'httpl://hosts', rel: 'via', title: 'Page', __no_via: true };
			}
			var otherLinks = local.queryLinks(links, { rel: '!via !up !self' });
			var niceuri = (uri.indexOf('httpl://') === 0) ? uri.slice(8) : uri;
			var html = render_explorer({
				via: res2.parsedHeaders.via||[],

				uri: uri,
				niceuri: niceuri,
				success: res2.status >= 200 && res2.status < 300,
				status: res2.status + ' ' + (res2.reason||''),

				viaLink: viaLink,
				upLink: upLink,
				selfLink: selfLink,
				links: otherLinks || [],
			});
			res.writeHead(200, 'Ok', {'Content-Type': 'text/html'}).end(html);
		});
	});
});



function icons(link) {
	var icon = 'link';
	if (local.queryLink(link, { rel: 'gwr.io/datauri' }))
		icon = 'file';
	else if (local.queryLink(link, { rel: 'gwr.io/folder' }))
		icon = 'folder-open';
	return '<span class="glyphicon glyphicon-'+icon+'"></span>';
}

function title(link) {
	return common.escape(link.title || link.id || link.href);
}
function notmpl(uri) {
	return common.escape(local.UriTemplate.parse(uri).expand({}));
}

function render_explorer(ctx) {
	var href = function(link) {
		// __no_via is set by explorer, not expected on links
		return 'httpl://explorer?uri='+encodeURIComponent(link.__no_via ? link.href : local.makeProxyUri(ctx.via.concat(link.href)));
	};
	return [
		'<h1>Explorer</h1>',
		// '<form action ="httpl://explorer" method="GET">',
		// 	'<input class="form-control" type="text" value="'+ctx.uri+'" name="uri" />',
		// '</form>',
		'<ul class="list-inline" style="padding-top: 5px">',
			[
				((ctx.viaLink) ?
					'<li><a href="'+href(ctx.viaLink)+'" title="Via: '+title(ctx.viaLink)+'">'+title(ctx.viaLink)+'</a></li>'
				: ''),
				((ctx.upLink) ?
					'<li><a href="'+href(ctx.upLink)+'" title="Up: '+title(ctx.upLink)+'">'+title(ctx.upLink)+'</a></li>'
				: ''),
				((ctx.selfLink) ?
					'<li><a href="'+href(ctx.selfLink)+'" title="Up: '+title(ctx.selfLink)+'">'+title(ctx.selfLink)+'</a></li>'
				: ''),
			].filter(function(v) { return !!v; }).join('<li class="text-muted">/</li>'),
			// 	'<a class="glyphicon glyphicon-bookmark" href="httpl://href/edit?href='+encodeURIComponent(ctx.uri)+'" title="is a" target="_card_group"></a>',
			'<li><small class="text-muted">'+common.escape(ctx.status)+'</small>',
        '</ul>',
		'<div class="link-list-outer">',
			'<table class="link-list">',
				'<tbody>',
					ctx.links.map(function(link) {
						var cls='';
						if (link.hidden) {
							if (show_hidden) {
								cls = 'class=\"hidden-link\"';
							} else {
								return '';
							}
						}
						return [
							'<tr '+cls+'>',
								'<td>'+icons(link)+'</td>',
								'<td><a href="'+href(link)+'">'+title(link)+'</a></td>',
								'<td class="text-muted">'+link.href+'</td>',
							'</tr>',
						].join('');
					}).join(''),
				'</tbody>',
			'</table>',
		'</div>',
		((ctx.selfLink) ? [
			'<hr>',
			'<small><a href="'+notmpl(ctx.selfLink.href)+'" title="Open (GET)">&raquo; '+title(ctx.selfLink)+'</a></small>',
			'<br>',
			((show_hidden) ?
				'<small><a href="'+href(ctx.selfLink)+'&show_hidden=0" title="Hide Hidden Links">hide hidden</a></small>' :
				'<small><a href="'+href(ctx.selfLink)+'&show_hidden=1" title="Show Hidden Links">show hidden</a></small>'
			)
		].join('') : ''),
	].join('');
}

server.route('/online', function(link, method) {
	method('HEAD', forbidAll, function() { return 204; });
	method('SHOW', forbidAll, function(req, res) {
		// :DEBUG: temporary helper
		common.layout.toggle('east');
		return 204;
	});
});

server.route('/intro', function(link, method) {
	link({ href: '/', rel: 'up service', id: 'explorer', title: 'Explorer' });
	link({ href: '/intro', rel: 'self service gwr.io/page', id: 'intro', title: 'About' });

	method('HEAD', forbidAll, function() { return 204; });
	method('GET', forbidAll, function(req, res) {
		req.assert({ accept: 'text/html' });
		return [200, [
			'<div class="row">',
				'<div class="col-xs-8">',
					'<h1>About</h1>',
					'<p>',
						'Grimwire is a <a href="http://gwr.io/" target="_blank">link-driven</a> server platform for WebRTC.',
						'In addition to hosting user programs, it provides tools to <a href="httpl://explorer/online?steal_focus=1" method="SHOW" target="_null">find peers</a>, <a href="httpl://explorer">navigate interfaces</a>, and <a href="httpl://workers/ed/0?steal_focus=1" method="SHOW" target="_null">edit code</a>.',
					'</p>',
					'<br><br>',
					'<h3>How does it work?</h3>',
					'<p>Grimwire uses...</p>',
					'<ul>',
						'<li><a href="http://www.webrtc.org/" target="_blank">WebRTC</a> for networking.</li>',
						'<li><a href="https://grimwire.com/local" target="_blank">HTTPLocal</a>, a client-side implementation of HTTP, to communicate.</li>',
						'<li><a href="http://en.wikipedia.org/wiki/Server-sent_events"target="_blank">Server-Sent Events</a> from a <a href="https://grimwire.com/download" target="_blank">central server</a> to relay signals.</li>',
						'<li><a href="http://tools.ietf.org/html/rfc5988" target="_blank">Link headers</a> to exchange directories.</li>',
						'<li><a href="https://developer.mozilla.org/en-US/docs/Web/Guide/Performance/Using_web_workers" target="_blank">Web Workers</a> to host user servers.</li>',
						'<li><a href="https://developer.mozilla.org/en-US/docs/Security/CSP/Introducing_Content_Security_Policy" target="_blank">Content Security Policy</a> to restrict what the page will include.</li>',
						'<li>Iframes to sandbox styles.</li>',
					'</ul>',
					'<br><br>',
					'<h3>This is an <strong class="text-danger">unstable</strong> build.</h3>',
					'<p>',
						'Some security policies have not been deployed.',
						'Please be kind to each other!',
					'</p>',
					'<br><br>',
					'<h3>How do I use it?</h3>',
					'<p>Here are some quick getting started tips:</p>',
					'<br><div style="padding: 10px 20px">',
						'<h4 style="margin-top:0">Editing Workers</h4>',
						'<p>Open the workers editor by clicking the gray bar on the far left or by pressing <code>ctrl &larr;</code>.</p>',
						'<div class="thumbnail">',
							'<img src="/img/help_open_worker_panel.png"/>',
						'</div>',
						'<br><hr>',
					'</div>',
					'<br><div style="padding: 10px 20px">',
						'<h4 style="margin-top:0">See Who is Online</h4>',
						'<p>Open the users panel by clicking the gray bar on the far right or by pressing <code>ctrl &rarr;</code>.</p>',
						'<div class="thumbnail">',
							'<img src="/img/help_open_users_panel.png"/>',
						'</div>',
						'<br><hr>',
					'</div>',
					'<br><div style="padding: 10px 20px">',
						'<h4 style="margin-top:0">Publish a Server</h4>',
						'<p>Run a worker locally by pressing the green triangle. Publish it to the entire network by pressing the globe.</p>',
						'<div class="thumbnail">',
							'<img src="/img/help_publish_server.png"/>',
						'</div>',
					'</div>',
					'<br><br>',
					'<h3>Who made Grimwire?</h3>',
					'<p>',
						'<a href="https://twitter.com/pfrazee" target="_blank">Paul Frazee</a>.',//' is an Austin-based developer with over fifteen years of development experience.',
					'</p>',
					'<br><br><br>',
				'</div>',
				'<div class="col-xs-4">',
				'</div>',
			'</div>'
		].join(' '), { 'content-type': 'text/html' }];
	});
});