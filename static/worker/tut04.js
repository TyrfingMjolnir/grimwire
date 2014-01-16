/**
 * Tutorial 4
 * ==========
 * "Link Directories"
 *
 * How to export and consume link directories.
 *
 * About:
 * - Grimwire uses the Link response header to export "directories" of links.
 * - You can find the specification for this at http://tools.ietf.org/html/rfc5988
 *
 * How the links are used:
 * - Programs fetch the Link headers with HEAD requests.
 * - Queries are run against the links' KV attributes.
 * - Matching links are used as Ajax targets.
 */

importScripts('/js/local.js'); // docs @ https://grimwire.com/local
importScripts('/js/servware.js'); // docs @ https://github.com/pfraze/servware

var server = servware();
local.worker.setServer(server);

server.route('/', function(link, method) {
	/**
	 * Use Servware's link() to add items to the Link response header.
	 * - `href` is the URL (or a relative path which resolves to one of this service's URLs)
	 * - `rel` contains the relation types. It describes what this resource is.
	 *   - 'self' says the link points to the same place the response came from.
	 *   - 'service' is a generic description of what we are.
	 *   - Other common generic labels: 'collection', 'item'.
	 *   - See http://www.iana.org/assignments/link-relations/link-relations.xhtml
	 * - `id` is optional to identify a resource within the server's namespace.
	 * - `title` is for humans.
	 */
	link({ href: '/', rel: 'self service', title: 'Tutorial 4: Link Directories' });
	link({ href: '/some-item', rel: 'item', title: 'Some Item' });
	link({ href: '/test-page', rel: 'item gwr.io/page', id: 'test', title: 'Test 1 2 3' });
	/**
	 * Note: link() functions are run once at setup.
	 * Links which depend on the request must be set in the method handler.
	 */

	method('HEAD', function(req, res) {
		// Servware defines this HEAD method for all servers.
		// - It responds 204 and will include the link headers.
		// - You can override it as we do here.
		return 204; // Respond 204 No Content
	});

	method('GET', function(req, res) {
		/**
		 * Setting the link header within the method handler:
		 * - Servware includes res.link(), which can be run within the method handler.
		 * - `res.link({ href: '/', rel: 'self service', title: 'Tutorial 4: Link Directories' })`
		 *
		 * Local's res.setHeader() is also available:
		 * - `res.setHeader('Link', [{ href: '/', rel: 'self service' ...}])`
		 * - Takes the entire header at once (not 1 link at a time).
		 * - Can be given an array of objects [{ href:, rel: }...]
		 * - Can be edited with res.headers.link
		 */

		// Fetch our own index
		return local.HEAD('httpl://self').then(function(res2) {
			// ^ Remember, httpl://self is a private, self-referencing name for workers

			// Run some queries on the response's links
			var items = local.queryLinks(res2, { rel: 'item' });
			var pages = local.queryLinks(res2, { rel: 'gwr.io/page' });
			var self = local.queryLinks(res2, { rel: 'self' })[0];
			var test_page = local.queryLinks(res2, { rel: 'gwr.io/page', id: 'test' })[0];
			/**
			 * queryLinks
			 * - Docs at https://grimwire.com/local/#docs/api/querylinks.md
			 * - Takes: (a response or an array of links, a query object)
			 * - Produces an array of matches in the order they were given
			 */

			// Generate the interface
			var explorer_uri = 'httpl://explorer?uri='+encodeURIComponent('httpl://'+req.headers.host);
			var html = [
				'<h1>Tutorial 4 <small>Link Directories</small></h1>',
				'<p>All links:</p>',
				'<ul>',
					res2.parsedHeaders.link.map(function(link) {
						return '<li><a href="'+link.href+'" target="_content">'+link.title+'</a> <code>'+link.rel+'</code></li>';
					}).join(' '),
					/**
					 * res2.parsedHeaders
					 * - Some headers are automatically parsed and put here
					 * - Parsers registered with local.httpHeaders.register()
					 * - res2.headers keeps the original serialized form
					 */
				'</ul>',
				'<p>Items:</p>',
				'<ul>',
					items.map(function(item) {
						return '<li><a href="'+item.href+'" target="_content">'+item.title+'</a> <code>'+item.rel+'</code></li>';
					}).join(' '),
				'</ul>',
				'<p>Pages:</p>',
				'<ul>',
					pages.map(function(page) {
						return '<li><a href="'+page.href+'" target="_content">'+page.title+'</a> <code>'+page.rel+'</code></li>';
					}).join(' '),
				'</ul>',
				'<p>Self: <a href="'+self.href+'" target="_content">'+self.title+'</a> <code>'+self.rel+'</code></p>',
				'<p>Test Page: <a href="'+test_page.href+'" target="_content">'+test_page.title+'</a> <code>'+test_page.rel+'</code></p>',
				'<p><small class="text-muted">View this program in the <a href="'+explorer_uri+'" target="_content">link explorer</a>.</small></p>'
			].join(' ');

			// Make all the httpl://self links relative again
			html = html.replace(/httpl:\/\/self/g, ''); // eg httpl://self/some-item -> /some-item
			// Respond
			return [200, html, {'Content-Type': 'text/html'}];
		});
	});
});

server.route('/some-item', function(link, method) {
	link({ href: '/', rel: 'up service', title: 'Tutorial 4: Link Directories' });
	link({ href: '/some-item', rel: 'self item', title: 'Some Item' });
	link({ href: '/test-page', rel: 'item gwr.io/page', id: 'test', title: 'Test 1 2 3' });
	/**
	 * Up reltypes
	 * - Signifies hierarchy.
	 * - Similar to the ".." path in a file system.
	 */

	method('GET', function(req, res) {
		req.assert({ accept: 'application/json' });
		return [200, { 'some item': true }];
	});
});

server.route('/test-page', function(link, method) {
	link({ href: '/', rel: 'up service', title: 'Tutorial 4: Link Directories' });
	link({ href: '/some-item', rel: 'item', title: 'Some Item' });
	link({ href: '/test-page', rel: 'self item gwr.io/page', id: 'test', title: 'Test 1 2 3' });

	method('GET', function(req, res) {
		req.assert({ accept: 'text/html' });
		res.setHeader('Content-Type', 'text/html');
		return [200, '<h1>Tutorial 4 <small>Test Page</small></h1><p>Testing 123</p>'];
	});
});