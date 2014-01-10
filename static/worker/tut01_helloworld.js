/**
 * Tutorial 1
 * ==========
 * "Hello World"
 *
 * Welcome to Grimwire!
 *
 * You've embarked on a harrowing adventure, hacker.
 * There will be *bugs*, mysterious ~API decisions~, and _poor documentation_.
 *
 * But!
 * Whence you walk forth from this winding path, you shall be armed with =skillz=.
 * And those skillz will command the realm.
 *
 * So tread forth!
 * Be honest, true, curious, and caffeinated.
 * And beware the *bugs*.
 * For they await us all.
 * ~pfraze
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
	// - `href` is the URL. We give our '/' path here.
	// - `rel` contains the relation types. It describes what this resource is.
	//   - 'self' says the link points to the same place the response came from.
	//   - 'service' is a generic description of what we are.
	//   - Other common generic labels: 'collection', 'item'

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
		return [200, 'Hello, world!<br><a href="httpl://'+req.host+'/complete" target="_content">click this to complete tutorial 1.</a>'];
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
	// - The 'up' reltype signifies a hierarchy which usually terminates at the root program.
	//   - It's the ".." in a file picker.

	// Add GET to '/complete'
	method('GET', function(req, res) {
		// Respond 406 Not Acceptable if the GET request doesn't accept HTML
		req.assert({ accept: 'text/html' });

		// Label the response content as HTML
		res.setHeader('Content-Type', 'text/html');

		// Respond 200 OK with the following content
		return [200, '<strong>Well done!</strong> You have completed tutorial 1.'];
	});
});

/**
 * This Web Worker contains the power to say Hello to everybody in the world.
 * Press the > button to run it privately.
 * Then, refresh your links in the right panel and open tut01_helloworld.js.
 */