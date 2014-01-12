/**
 * Tutorial 3
 * ==========
 * "Links"
 *
 * Consuming and exporting link directories.
 */

importScripts('/js/local.js'); // docs @ https://grimwire.com/local
importScripts('/js/servware.js'); // docs @ https://github.com/pfraze/servware

var server = servware();
local.worker.setServer(server);

server.route('/', function(link, method) {
	link({ href: '/', rel: 'self service', title: 'Tutorial 3: Links' });
	link({ href: '/some-item', rel: 'item', title: 'Some Item' });
	link({ href: '/test-page', rel: 'item gwr.io/page', id: 'test', title: 'Test 1 2 3' });

	method('GET', function(req, res) {
        // Fetch our own index
        return local.HEAD('httpl://self').then(function(res2) {
            // Run some queries
            var items = local.queryLinks(res2, { rel: 'item' });
            var pages = local.queryLinks(res2, { rel: 'gwr.io/page' });
            var self = local.queryLinks(res2, { rel: 'self' })[0];
            var test_page = local.queryLinks(res2, { rel: 'gwr.io/page', id: 'test' })[0];
            /**
             * queryLinks
             * - Docs at https://grimwire.com/local/#docs/api/querylinks.md
             * - Can take a response or an array of links
             */

            // Generate the home interface
            var html = [
                '<h1>Tutorial 3 <small>Links</small></h1>',
                '<p>All links:</p>',
                '<ul>',
                    res2.parsedHeaders.link.map(function(link) {
                        return '<li><a href="'+link.href+'" target="_content">'+link.title+'</a> <code>'+link.rel+'</code></li>';
                    }).join(' '),
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
            ].join(' ');
            // Make all the self links relative
            html = html.replace(/httpl:\/\/self/g, ''); // eg httpl://self/some-item -> /some-item
            return [200, html, {'Content-Type': 'text/html'}];
            /**
             * Returning headers
             * - The third element of the returned array may contain header values.
             */
        });
	});
});

server.route('/some-item', function(link, method) {
	link({ href: '/', rel: 'up service', title: 'Tutorial 3: Links' });
	link({ href: '/some-item', rel: 'self item', title: 'Some Item' });

    method('GET', function(req, res) {
		req.assert({ accept: 'application/json' });
		return [200, { 'some item': true }];
	});
});


server.route('/test-page', function(link, method) {
	link({ href: '/', rel: 'up service', title: 'Tutorial 3: Links' });
	link({ href: '/test-page', rel: 'self item gwr.io/page', id: 'test', title: 'Test 1 2 3' });

    method('GET', function(req, res) {
		req.assert({ accept: 'text/html' });
		res.setHeader('Content-Type', 'text/html');
		return [200, '<h1>Tutorial 3 <small>Test Page</small></h1><p>Testing 123</p>'];
	});
});
