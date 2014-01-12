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
	link({ href: '/', rel: 'self service', title: 'Tutorial 2: Content Types' });

	method('GET', function(req, res) {
		// Compare our preferred formats against the requests' preferences (as given in the Accept header)
		var type = local.preferredType(req, ['text/html', 'application/json']);
		if (!type) {
			// They requested a type that we don't support
			throw 406; // Respond 406 Not Acceptable
		}

		if (type == 'text/html') {
			res.setHeader('Content-Type', 'text/html');
			return [200, [
                '<a href="httpl://tut02.js/" type="application/json" target="_content">Get as JSON.</a>',
                '<a href="httpl://tut02.js/decorated" target="_content">Decorate the JSON.</a>'
            ].join('<br>')];
		}
		/**
		 * About the 'type' attribute on links
		 * - This is an obscure but standard use.
		 * - Grimwire sets the accept header to it.
		 *
		 * About the 'target' attribute on links
		 * - Grimwire adds the _content target to signify the response should populate the main iframe.
		 * - If no target is set, the response is logged and discarded.
		 * - If the target is _top or _blank, the default browser behavior is used (no HTTPLocal intercept)
		 */

		if (type == 'application/json') {
			res.setHeader('Content-Type', 'application/json');
			return [200, { hey: 'it is json' }];
		}
	});
});

server.route('/decorated', function(link, method) {
	link({ href: '/', rel: 'up service', title: 'Tutorial 2: Content Types' });

    method('GET', function(req, res) {
		var type = local.preferredType(req, 'text/html');
		if (!type) {
			throw 406;
		}

        return local.GET({ url: 'httpl://self/', Accept: 'application/json' })
            .then(function(res2) {
                res.setHeader('Content-Type', 'text/html');
                return [200, 'Hey: <strong>'+res2.body.hey+'</strong>'];
            });
        /**
         * Returning promises.
         * - "Promises" are variables which don't have values yet - but will in the future.
         * - As shown here, the request methods in local return promises.
         * - Servware accepts a promise for the response.
         */
	});
});
