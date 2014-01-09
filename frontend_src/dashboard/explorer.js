/*
httpl://explorer

The Link Explorer
 - Renders indexes exported by hosts with the directory protocol
*/


var common = require('./common');

var server = servware();
module.exports = server;

server.route('/', function(link, method) {
	link({ href: 'httpl://hosts', rel: 'via', id: 'hosts', title: 'Page' });
	link({ href: '/', rel: 'self service', id: 'explorer', title: 'Explorer' });
	link({ href: '/intro', rel: 'service gwr.io/page', id: 'intro', title: 'About' });

	method('GET', function(req, res) {
		var uri = req.query.uri || 'httpl://hosts';
		var uritmpl = local.UriTemplate.parse(uri);
		var ctx = {};
		uritmpl.expressions.forEach(function(expr) {
			if (expr.operator && expr.operator.symbol == '') {
				// This is a path token, ask for values
				expr.varspecs.forEach(function(varspec) {
					ctx[varspec.varname] = prompt(varspec.varname);
					if (ctx[varspec.varname] === null) throw 204; // aborted
				});
			}
		});
		uri = uritmpl.expand(ctx);
		local.HEAD(uri).always(function(res2) {
			// Build explore interface
			var links = (res2.parsedHeaders.link) ? res2.parsedHeaders.link : [];
			var viaLink = local.queryLinks(links, { rel: 'via !up !self' })[0];
			var upLink = local.queryLinks(links, { rel: 'up !self' })[0];
			var selfLink = local.queryLinks(links, { rel: 'self' })[0];
			if (!viaLink && (!selfLink || selfLink.host_domain != 'hosts')) {
				viaLink = { href: 'httpl://hosts', rel: 'via', title: 'Page' };
			}
			var otherLinks = local.queryLinks(links, { rel: '!via !up !self' });
			var niceuri = (uri.indexOf('httpl://') === 0) ? uri.slice(8) : uri;
			var html = render_explorer({
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
	return link.title || link.id || link.href;
}
function notmpl(uri) {
	return local.UriTemplate.parse(uri).expand({});
}

function render_explorer(ctx) {
	return [
		'<h1>Explorer</h1>',
		// '<form action ="httpl://explorer" method="GET" target="_content">',
		// 	'<input class="form-control" type="text" value="'+ctx.uri+'" name="uri" />',
		// '</form>',
		'<ul class="list-inline" style="padding-top: 5px">',
			((ctx.viaLink) ?
				'<li><b class=text-muted>.</b> <a href="httpl://explorer?uri='+encodeURIComponent(ctx.viaLink.href)+'" title="Via: '+title(ctx.viaLink)+'" target="_content">'+title(ctx.viaLink)+'</a></li>'
			: ''),
			((ctx.upLink) ?
				'<li><b class=text-muted>.</b> <a href="httpl://explorer?uri='+encodeURIComponent(ctx.upLink.href)+'" title="Up: '+title(ctx.upLink)+'" target="_content">'+title(ctx.upLink)+'</a></li>'
			: ''),
			((ctx.selfLink) ?
				'<li><b class=text-muted>.</b> <a href="httpl://explorer?uri='+encodeURIComponent(ctx.selfLink.href)+'" title="Up: '+title(ctx.selfLink)+'" target="_content">'+title(ctx.selfLink)+'</a></li>'
			: ''),
			// 	'<a class="glyphicon glyphicon-bookmark" href="httpl://href/edit?href='+encodeURIComponent(ctx.uri)+'" title="is a" target="_card_group"></a>',
			'<li><small class="text-muted">'+ctx.status+'</small>',
        '</ul>',
		'<div class="link-list-outer">',
			'<table class="link-list">',
				'<tbody>',
					ctx.links.map(function(link) {
						if (link.hidden) return '';
						return [
							'<tr>',
								'<td>'+icons(link)+'</td>',
								'<td><a href="httpl://explorer?uri='+encodeURIComponent(link.href)+'" target="_content">'+title(link)+'</a></td>',
								'<td class="text-muted">'+link.href+'</td>',
							'</tr>',
						].join('');
					}).join(''),
				'</tbody>',
			'</table>',
		'</div>',
		((ctx.selfLink) ?
			'<a class="btn btn-sm btn-default" href="'+notmpl(ctx.selfLink.href)+'" title="Open (GET)" target="_content">Open '+title(ctx.selfLink)+'</a></li>'
		: ''),
	].join('');
}

server.route('/intro', function(link, method) {
	link({ href: '/', rel: 'up service', id: 'explorer', title: 'Explorer' });
	link({ href: '/intro', rel: 'self service gwr.io/page', id: 'intro', title: 'About' });

	method('GET', function(req, res) {
		req.assert({ accept: 'text/html' });
		if (!req.query.page || req.query.page == '1') {
			var pfraze_href = 'nav:||contacts|gwr.io/contact/user=pfraze@grimwire.net';
			var pfraze_icon = 'https://grimwire.net/img/avatars/user_astronaut.png'; // :TODO:
			return [200, [
				'<div style="max-width: 600px">',
					'<h1>About</h1>',
					'<p>',
						'Have fun, and don\'t put anything important on here.',
					'</p>',
					'<hr>',
					'<p><span class="text-muted">What is it?</span></p>',
					'<p>',
						'Grimwire is a social runtime environment.',
						'It connects user Web-servers that live in other threads and tabs with the Web Worker and WebRTC APIs.',
						'Use it to publish services, datasets, and interfaces to other users.',
					'</p>',
					'<hr>',
					'<p><span class="text-muted">Getting Acquainted</span></p>',
					'<ul>',
						'<li>The updates feed is populated by your workers and peers.</li>',
						'<li>The explorer page browses through the active Web interfaces.</li>',
						'<li>See who\'s online by clicking the gray bar on the right edge.</li>',
						'<li>Edit your Web Workers by clicking the gray bar on the left edge.</li>',
						'<li>Try pressing <code>ctrl &larr;</code> and <code>ctrl &rarr;</code> on your keyboard.</li>',
						'<li>Refer to the <a href="https://grimwire.com/local" title="local.js documentation" target="_blank">Local.js API docs</a> for dev help.</li>',
					'</ul>',
					'<hr>',
					'<p><span class="text-muted">Core Principles</span></p>',
					'<p>',
						'All software in Grimwire is a Web service, and so all of the interfaces are linkable.',
						'Links can be assigned "relation-types" and other semantic meta-data like "title" and "author".',
						'They are exported in the \'Link\' headers of responses, and can be queried and navigated with client-side APIs.',
						'Those link directories are what the explorer reveals, and should be used to drive integration between apps (rather than hard-coded URIs).',
					'</p>',
					'<hr>',
					// '<p><span class="text-muted">Where does data live?</span></p>',
					// '<p>',
					// 	'Your links &amp; data can host from your browser, or go onto the network\'s central (public) routing service.',
					// 	'Anything on the network service is available when you go offline, but it can also be accessed by network moderators without your permission.',
					// 	'Therefore, you should consider using browser-hosting for more&nbsp;<a href="http://imgur.com/YLwRjM3" target="_blank">sensitive&nbsp;information</a>.',
					// '</p>',
					// '<hr>',
					// '<p><span class="text-muted">How do I control my data?</span></p>',
					// '<p>',
					// 	'For security, the browser separates your local storage by domain.',
					// 	'The Grimwire app is run on multiple subdomains so that you can take advantage&nbsp;of&nbsp;this.',
					// '</p>',
					// '<p>',
					// 	'Use a new subdomain when you want to try something and don\'t want to risk corrupting or leaking existing data.',
					// 	'You can copy data between the subdomains by opening both at once and using the&nbsp;Dataset&nbsp;panel.',
					// '</p>',
					// '<p>',
					// 	'You can also use Dataset to copy between browsers&nbsp;&amp;&nbsp;devices.',
					// '</p>',
					// '<hr>',
					// '<p><span class="text-muted">What is "bouncing?"</span></p>',
					// '<p>',
					// 	'Sometimes, peer-to-peer connections fail to establish.',
					// 	'The system can be set up to automatically bounce your messages through the network service (peer to network to peer) in that situation.',
					// 	'You can choose to enable this for a contact or set of contacts when convenient, but be sure to remember which subdomain&nbsp;you&nbsp;have&nbsp;open!',
					// '</p>',
					// '<hr>',
					'<p><a href="https://twitter.com/pfrazee" target="_blank">Paul Frazee</a>.</p>',
					'<p><small class="text-muted">Those who control the semantics, control the system.</small></p>',
				'</div>'
			].join(' '), { 'content-type': 'text/html' }];
		} else if (req.query.page == '2') {
			return [200, [
				'<p>Interfaces accumulate in stacks as you navigate.</p>',
				'<p><a href="httpl://explorer/intro?page=3" target="_card_self">Sometimes cards will change in place too.</a></p>'
			].join(''), { 'content-type': 'text/html' }];
		} else if (req.query.page == '3') {
			return [200, [
				'<p></p>'
			].join(''), { 'content-type': 'text/html' }];
		} else {
			throw 404;
		}
	});
});