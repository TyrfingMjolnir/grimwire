/**
 * Tutorial 1
 * ==========
 * "Hello World"
 *
 * How to serve an interface.
 */

// Import: the HTTPL interface
importScripts('/js/local.js'); // docs @ https://grimwire.com/local

// Import: a server framework
importScripts('/js/servware.js'); // docs @ https://github.com/pfraze/servware

// Create `server`
var server = servware();
local.worker.setServer(server);
/**
 * This server will handle requests from the page to the worker.
 */

// Define the Root Path
server.route('/', function(link, method) {

	// Add GET to '/'
	method('GET', function(req, res) {

		// Respond 406 Not Acceptable if the GET request doesn't accept HTML
		req.assert({ accept: 'text/html' });

		// Label the response content as HTML
		res.setHeader('Content-Type', 'text/html');

		// Respond 200 OK with the following content
		var html = [
			'<h1>Tutorial 1 <small>Hello World</small></h1>',
			'Hello, world!<br>',
			'<a href="/complete" target="_content">click this to complete tutorial 1.</a>'
		].join('');
		return [200, html];
		/**
		 * Servware allows its method handlers to return a description of the response.
		 * - You can also return a promise or throw an exception.
		 *   - (Exceptions are for the 4xx/5xx range of responses.)
		 * - There are lots of possible return values:
		 *   - return 200; // just the status number, the body is empty and some default headers (and the reason "OK") are used
		 *   - return [200, body]; // the status and the body of the response
		 *   - return [200, body, { 'Content-Type': 'text/html' }]; // the status, the body, and an object of headers
		 *   - return { status: 200, reason: 'Is OK', headers: { ... }, body: body }; // a full response object
		 *   - throw { status: 403, reason: 'forbidden' }; // example of throwing
		 *   - my_promise.fulfill([200, body]); // example of fulfilling a promise (which was previously returned)
		 */
	});
});

// Define a Subpath
server.route('/complete', function(link, method) {

	// Add GET to '/complete'
	method('GET', function(req, res) {

		// Respond 406 Not Acceptable if the GET request doesn't accept HTML
		req.assert({ accept: 'text/html' });

		// Label the response content as HTML
		res.setHeader('Content-Type', 'text/html');

		// Respond 200 OK with the following content
		var html = [
			'<h1>Tutorial 1 <small>Completed</small></h1>',
			'<strong>Well done!</strong> You have completed tutorial 1.<br>',
			'Be sure to find this program in the explorer. Doing so will help you understand how the links are used.'
		].join('');
		return [200, html];
	});
});

/**
 * This Web Worker contains the power to say Hello to everybody in the world.
 * Press the > button to run it privately.
 * Then, refresh your links in the right panel and open tut01_helloworld.js.
 */