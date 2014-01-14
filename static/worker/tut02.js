/**
 * Tutorial 2
 * ==========
 * "Content Types"
 *
 * How to use content types.
 */

importScripts('/js/local.js'); // docs @ https://grimwire.com/local
importScripts('/js/servware.js'); // docs @ https://github.com/pfraze/servware

var server = servware();
local.worker.setServer(server);

server.route('/', function(link, method) {
	method('GET', function(req, res) {
		// Compare our preferred formats against the requests' preferences (as given in the Accept header)
		var type = local.preferredType(req, ['text/html', 'application/json']);
		if (!type) {
			// They requested a type that we don't support
			throw 406; // Respond 406 Not Acceptable
		}
		/**
		 * Type negotiation with local.preferredType:
		 * - Compares the Accept header with an array of media types.
		 * - If Accept says "give me anything", the first media type in the array will be used.
		 */

		if (type == 'text/html') {
			res.setHeader('Content-Type', 'text/html');
			return [200, [
				'<h1>Tutorial 2 <small>Content Types</small></h1>',
				'<a href="/" type="application/json" target="_content">Get as JSON.</a>',
				'<a href="/decorated" target="_content">Decorate the JSON.</a>'
			].join('<br>')];
		}
		/**
		 * Notice the 'type' attribute on links, which sets the Accept header of the request.
		 */

		if (type == 'application/json') {
			res.setHeader('Content-Type', 'application/json');
			return [200, { hey: 'it is json' }];
		}
	});
});

server.route('/decorated', function(link, method) {
	method('GET', function(req, res) {
		var type = local.preferredType(req, 'text/html');
		if (!type) {
			throw 406;
		}

		// Request the JSON from our root path
		// - This will return a promise, which servware will watch for the final value
		return local.GET({ url: 'httpl://self/', Accept: 'application/json' })
			.then(function(res2) {
				res.setHeader('Content-Type', 'text/html');
				return [200, [
					'<h1>Tutorial 2 <small>Fetched and Decorated JSON</small></h1>',
					'<p>Hey: <strong>'+res2.body.hey+'</strong></p>'
				].join('')];
			});
		/**
		 * Using the httpl://self host.
		 * - Within the workers' local hostmap, httpl://self points to the server used for the host page
		 *   - (That's this server.)
		 * - The URL is only meaningful to code within the worker.
		 *   - Don't bother putting httpl://self in HTML!
		 *   - The HTML requests are executed within the page's thread, which has its own hostmap.
		 */
	});
});
