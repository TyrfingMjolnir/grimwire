/**
 * Tutorial 3
 * ==========
 * "Forms and Anchors"
 *
 * How to use forms and anchors to drive the UI.
 *
 * About:
 * - Grimwire uses <form> and <a> to generate requests rather than handling individual 'click' events.
 * - Since services live client-side, this happens as quickly as event-handling would.
 * - (A few <form> and <a> attributes we use are non-standard.)
 */

importScripts('/js/local.js'); // docs @ https://grimwire.com/local
importScripts('/js/servware.js'); // docs @ https://github.com/pfraze/servware

var server = servware();
local.worker.setServer(server);

server.route('/', function(link, method) {
	method('GET', function(req, res) {
		req.assert({ accept: 'text/html' });
		res.setHeader('Content-Type', 'text/html');
		return [200, [
			'<h1>Tutorial 3 <small>Forms and Anchors</small></h1>',

			/**
			 * <a> - default behaviors.
			 */
			'<p><a href="/foo" target="_content">Simple anchor</a></p>',

			/**
			 * <a> - custom method.
			 */
			'<p><a href="/foo" method="POST" target="_content">Anchor (Method POST)</a></p>',

			/**
			 * <a> - request a media type.
			 */
			'<p><a href="/foo" type="application/json" target="_content">Anchor (Accept JSON)</a></p>',

            /**
             * <form> - default behaviors.
             */
			'<p>Simple form</p>',
			'<form action="/foo" method="POST" target="_content">',
				'<input type="text" name="field" />',
				'<button name="btn" value="btnvalue">Submit</button>',
			'</form>',

            /**
             * <form> - request a media type.
             */
			'<p>Form (Enctype JSON)</p>',
			'<form action="/foo" method="POST" enctype="application/json" target="_content">',
				'<input type="text" name="field" />',
				'<button name="btn" value="btnvalue">Submit</button>',
			'</form>',

            /**
             * <form> - encode body in a media type.
             * (supports json and x-www-url-formencoded)
             */
			'<p>Form (Accept JSON)</p>',
			'<form action="/foo" method="POST" accept="application/json" target="_content">',
				'<input type="text" name="field" />',
				'<button name="btn" value="btnvalue">Submit</button>',
			'</form>',

            /**
             * <form> - different parameters on each button.
             */
			'<p>Form with button overrides</p>',
			'<form action="/foo" method="POST" target="_content">',
				'<input type="text" name="field" />',
				'<button name="btn" value="btnvalue1" formaccept="application/json" >Submit (Accept JSON)</button>',
				'<button name="btn" value="btnvalue2" formenctype="application/json" >Submit (Enctype JSON)</button>',
				'<button name="btn" value="btnvalue3" formmethod="PATCH" >Submit (Method PATCH)</button>',
			'</form>',
		].join('')];
	});
});

server.route('/foo', function(link, method) {

	method('GET', function(req, res) {
		var type = local.preferredType(req, ['text/html', 'application/json']);
		if (!type) throw 406;
		if (type == 'text/html') {
			res.setHeader('Content-Type', 'text/html');
			return [200, '<h1>Tutorial 3 <small>/Foo</small></h1><p>Bar</p>'];
		}
		return [200, { foo: 'bar' }];
	});

	method('POST', function(req, res) {
		var type = local.preferredType(req, ['text/html', 'application/json']);
		if (!type) throw 406;

		var results = { headers: req.headers, body: req.body };

		if (type == 'text/html') {
			res.setHeader('Content-Type', 'text/html');
			return [200, '<h1>Tutorial 3 <small>/Foo POST</small></h1><pre>'+JSON.stringify(results)+'</pre>'];
		}
		return [200, results];
	});
});
