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

// Define the Root Path
server.route('/', function(link, method) {

	// Add a link to all '/' responses
	link({
		href: '/',
		rel: 'self service',
		title: 'Tutorial 1: Hello World Worker'
	});
	/**
	 * About this command
	 * - `href` is the URL. We give our '/' path here.
	 *   - The page will transform paths into full URIs for links in the Link header and in the HTML.
	 * - `rel` contains the relation types. It describes what this resource is.
	 *   - 'self' says the link points to the same place the response came from.
	 *   - 'service' is a generic description of what we are.
	 *   - Other common generic labels: 'collection', 'item'
	 */

	// Also add this link
	link({
		href: '/complete',
		rel: 'item',
		id: 'complete',
		title: 'Completion Page'
	});

	// Add GET to '/'
	method('GET', function(req, res) {
		// Respond 406 Not Acceptable if the GET request doesn't accept HTML
		req.assert({ accept: 'text/html' });

		// Label the response content as HTML
		res.setHeader('Content-Type', 'text/html');

		// Respond 200 OK with the following content
		return [200, 'Hello, world!<br><a href="/complete" target="_content">click this to complete tutorial 1.</a>'];
		/**
		 * Link HREFs
		 * - We use a relative path (/complete) for the link again.
		 *   - This is because the host page transforms HTML and Link-header paths into absolute URLs.
		 *
		 * (Advanced) the global hostname is used for the transformation if the response was retrieved globally.
		 * - If the request was to httpl://tut01_helloworld.js...
		 *   it would transform to httpl://tut01_helloworld.js/complete
		 * - If the request was to httpl://bob@grimwire.net!grimwire.net!123/tut01_helloworld.js...
		 *   it would transform to httpl://bob@grimwire.net!grimwire.net!123/tut01_helloworld.js/complete
		 * - ~That global URI is pretty clunky right now. Two grimwire.nets?~
		 *   - Please excuse the mess.
		 *   - This is kind of like typing http://foobar.com:80/
		 *   - It will be able to condense all the way down to httpl://bob@grimwire.net/ in future releases.
		 */
	});
});

// Define a Subpath
server.route('/complete', function(link, method) {

	// Add the same two links as at the root path
	link({
		href: '/',
		rel: 'up service',
		title: 'Tutorial 1: Hello World Worker'
	});
	link({
		href: '/complete',
		rel: 'self item',
		id: 'complete',
		title: 'Completion Page'
	});
	/**
	 * Up reltypes
	 * - Signifies a hierarchy which usually terminates at the root program.
	 * - Similar to the ".." path in a file system.
	 */

	// Add GET to '/complete'
	method('GET', function(req, res) {
		// Respond 406 Not Acceptable if the GET request doesn't accept HTML
		req.assert({ accept: 'text/html' });

		// Label the response content as HTML
		res.setHeader('Content-Type', 'text/html');

		// Respond 200 OK with the following content
		return [200, '<strong>Well done!</strong> You have completed tutorial 1.<br>Be sure to find this program in the explorer. Doing so will help you understand how the links are used.'];
	});
});

/**
 * This Web Worker contains the power to say Hello to everybody in the world.
 * Press the > button to run it privately.
 * Then, refresh your links in the right panel and open tut01_helloworld.js.
 */